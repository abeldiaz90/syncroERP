import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as XLSX from 'xlsx';

import { Producto } from '../entities/producto.entity';
import { Almacen } from '../entities/almacen.entity';
import { InventarioService } from './inventario.service';
import { MotorContableService } from '../../finanzas/services/motor-contable.service';
import { ErrorFila, ResultadoImportacion } from '../importacion.types';

/**
 * Carga masiva de INVENTARIO INICIAL (estilo SAP movimiento 561).
 *
 * A diferencia del importador de catálogo (que solo crea productos), esta
 * carga hace DOS cosas de forma atómica:
 *   1. FÍSICO: entra la cantidad al stock del almacén indicado.
 *   2. CONTABLE: genera UNA póliza global de la carga:
 *        Dr. Inventario (cuentaInventarioId de la categoría de cada producto)
 *        Cr. 399-01 Carga de saldos iniciales (cuenta puente)
 *
 * Así el inventario físico y el contable nacen cuadrados. La cuenta puente
 * la cancela el contador contra capital al terminar la carga de saldos.
 *
 * Costo unitario: se toma del Excel; si viene vacío, fallback al
 * precioCompra del producto; si ambos son 0 → error de fila.
 *
 * Modo 'validar' no persiste nada. Modo 'aplicar' ejecuta en transacción.
 */
@Injectable()
export class ImportacionStockInicialService {
  private readonly logger = new Logger(ImportacionStockInicialService.name);

  constructor(
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    @InjectRepository(Almacen)
    private readonly almacenRepo: Repository<Almacen>,
    private readonly inventarioService: InventarioService,
    private readonly motorContable: MotorContableService,
    private readonly dataSource: DataSource,
  ) {}

  async importar(
    buffer: Buffer,
    modo: 'validar' | 'aplicar',
    empresaId: string,
  ): Promise<ResultadoImportacion> {
    const filas = this.leerExcel(buffer);
    if (filas.length === 0) {
      throw new BadRequestException(
        'El archivo no contiene filas de datos. Usa la plantilla de stock inicial.',
      );
    }
    if (filas.length > 2000) {
      throw new BadRequestException(
        `El archivo tiene ${filas.length} filas; el máximo por carga es 2000.`,
      );
    }

    const errores: ErrorFila[] = [];
    const advertencias: ErrorFila[] = [];

    // ── catálogos en memoria ──
    const productos = await this.productoRepo.find({
      where: { empresaId },
      relations: ['categoria'],
    });
    const porSku = new Map(productos.map((p) => [p.sku.toLowerCase(), p]));

    const almacenes = await this.almacenRepo.find({ where: { empresaId } });
    const porAlmacen = new Map(almacenes.map((a) => [a.nombre.toLowerCase(), a]));

    // ── validación fila por fila ──
    interface FilaValida {
      fila: number;
      producto: Producto;
      almacen: Almacen;
      cantidad: number;
      costoUnitario: number;
      lote?: string;
      caducidad?: string;
    }
    const validas: FilaValida[] = [];
    const vistos = new Set<string>(); // sku+almacen duplicado en el archivo
    let omitidas = 0; // filas de la plantilla pre-llenada sin cantidad capturada

    filas.forEach((f, i) => {
      const nFila = i + 3; // fila real en el Excel (título + encabezado)
      const sku = String(f.sku ?? '').trim();
      const nombreAlmacen = String(f.almacen ?? '').trim();

      // Plantilla PRE-LLENADA: si la cantidad está vacía, el usuario decidió
      // no cargar stock de este producto → se omite sin error.
      const cantidadCruda = String(f.cantidad ?? '').trim();
      if (sku && cantidadCruda === '') {
        omitidas++;
        return;
      }

      if (!sku) {
        errores.push({ fila: nFila, campo: 'sku', mensaje: 'SKU vacío' });
        return;
      }
      const producto = porSku.get(sku.toLowerCase());
      if (!producto) {
        errores.push({
          fila: nFila, sku, campo: 'sku',
          mensaje: `SKU '${sku}' no existe. Carga primero el catálogo de productos.`,
        });
        return;
      }
      if (!nombreAlmacen) {
        errores.push({ fila: nFila, sku, campo: 'almacen', mensaje: 'Almacén vacío' });
        return;
      }
      const almacen = porAlmacen.get(nombreAlmacen.toLowerCase());
      if (!almacen) {
        errores.push({
          fila: nFila, sku, campo: 'almacen',
          mensaje: `Almacén '${nombreAlmacen}' no existe (revisa la hoja "Almacenes" de la plantilla)`,
        });
        return;
      }

      const cantidad = Number(f.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        errores.push({
          fila: nFila, sku, campo: 'cantidad',
          mensaje: `Cantidad inválida: '${f.cantidad}' (debe ser mayor a 0)`,
        });
        return;
      }

      // Costo: Excel → fallback precioCompra → error
      let costoUnitario = Number(f.costoUnitario);
      if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
        costoUnitario = Number(producto.precioCompra ?? 0);
        if (costoUnitario > 0) {
          advertencias.push({
            fila: nFila, sku, campo: 'costoUnitario',
            mensaje: `Sin costo en el archivo; se usó el precio de compra del producto ($${costoUnitario})`,
          });
        }
      }
      if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
        errores.push({
          fila: nFila, sku, campo: 'costoUnitario',
          mensaje: 'Sin costo válido: ni en el archivo ni en el precio de compra del producto. Inventario a costo $0 descuadra la contabilidad.',
        });
        return;
      }

      // La categoría debe tener cuenta de inventario (para el asiento)
      const cat = producto.categoria as any;
      if (!cat?.cuentaInventarioId) {
        errores.push({
          fila: nFila, sku, campo: 'categoria',
          mensaje: `La categoría '${cat?.nombre ?? '(sin categoría)'}' no tiene cuenta de inventario asignada; asígnala en Categorías antes de cargar stock`,
        });
        return;
      }

      // Duplicado dentro del mismo archivo
      const clave = `${sku.toLowerCase()}|${almacen.id}`;
      if (vistos.has(clave)) {
        errores.push({
          fila: nFila, sku, campo: 'sku',
          mensaje: `Duplicado en el archivo: ya hay una fila para '${sku}' en '${almacen.nombre}'`,
        });
        return;
      }
      vistos.add(clave);

      // Caducidad: normalizar venga como venga desde Excel
      const { fecha: caducidad, error: errCad } = this.normalizarCaducidad(f.caducidad);
      if (errCad) {
        errores.push({ fila: nFila, sku, campo: 'caducidad', mensaje: errCad });
        return;
      }

      validas.push({
        fila: nFila, producto, almacen, cantidad, costoUnitario,
        lote: f.lote !== null && f.lote !== undefined && String(f.lote).trim() !== ''
          ? String(f.lote).trim() : undefined,
        caducidad,
      });
    });

    if (omitidas > 0) {
      advertencias.unshift({
        fila: 0,
        sku: '—',
        mensaje: `${omitidas} productos sin cantidad capturada: se omiten (no se les carga stock)`,
      });
    }

    const resultado: ResultadoImportacion = {
      modo,
      totalFilas: filas.length,
      creados: 0,
      actualizados: 0,
      conError: errores.length,
      errores,
      advertencias,
    };

    if (modo === 'validar' || validas.length === 0) {
      resultado.creados = modo === 'validar' ? validas.length : 0;
      return resultado;
    }

    // ── APLICAR: todo o nada, en transacción ──
    if (errores.length > 0) {
      throw new BadRequestException(
        `Hay ${errores.length} filas con error. Corrige el archivo y vuelve a validar antes de aplicar.`,
      );
    }

    await this.dataSource.transaction(async (em) => {
      for (const v of validas) {
        // Entrada física, dentro de la MISMA transacción
        await this.inventarioService.registrarCompra(
          v.producto.id,
          v.almacen.id,
          v.cantidad,
          'Inventario inicial (carga de saldos)',
          empresaId,
          v.lote,
          v.caducidad,
          undefined,
          em,
        );
      }
    });

    // ── UNA póliza global de toda la carga (fuera de la transacción física,
    //     mismo criterio que el resto del motor: si falla, se loguea y se
    //     puede regenerar; el stock ya quedó consistente) ──
    await this.motorContable.generarAsientoDeInventarioInicial({
      empresaId,
      fecha: new Date(),
      detalles: validas.map((v) => ({
        productoId: v.producto.id,
        cantidad: v.cantidad,
        costoUnitario: v.costoUnitario,
      })),
    });

    resultado.creados = validas.length;
    this.logger.log(
      `Stock inicial aplicado: ${validas.length} filas · empresa ${empresaId}`,
    );
    return resultado;
  }


  // ───────────────────────────────────────────────────────────────
  /**
   * Normaliza la caducidad venga como venga desde Excel:
   *  · Date (cellDates:true) · número de serie de Excel · texto 'AAAA-MM-DD' o 'DD/MM/AAAA'
   * Devuelve 'AAAA-MM-DD' o un mensaje de error si es inválida/fuera de rango.
   */
  private normalizarCaducidad(v: any): { fecha?: string; error?: string } {
    if (v === null || v === undefined || String(v).trim() === '') return {};

    let d: Date | null = null;

    if (v instanceof Date) {
      d = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      // Número de serie de Excel (días desde 1899-12-30)
      d = new Date(Math.round((v - 25569) * 86400 * 1000));
    } else {
      const s = String(v).trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      } else {
        m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); // DD/MM/AAAA
      }
    }

    if (!d || isNaN(d.getTime())) {
      return { error: `Caducidad inválida: '${v}'. Usa formato AAAA-MM-DD (ej. 2027-08-15)` };
    }
    const anio = d.getUTCFullYear();
    if (anio < 2000 || anio > 2100) {
      return { error: `Caducidad fuera de rango (año ${anio}). Usa formato AAAA-MM-DD (ej. 2027-08-15)` };
    }
    return { fecha: d.toISOString().slice(0, 10) };
  }

  // ───────────────────────────────────────────────────────────────
  private leerExcel(buffer: Buffer): any[] {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException('El archivo no es un Excel válido (.xlsx)');
    }
    const hoja = wb.Sheets['StockInicial'] ?? wb.Sheets[wb.SheetNames[0]];
    if (!hoja) throw new BadRequestException('El archivo no tiene hojas');
    // range: 1 → los encabezados están en la fila 2 (la 1 es el título)
    return XLSX.utils.sheet_to_json(hoja, { range: 1, defval: '' });
  }
}