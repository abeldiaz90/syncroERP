import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';

import { Almacen } from '../entities/almacen.entity';
import { Producto } from '../entities/producto.entity';

/**
 * Plantilla de CARGA DE STOCK INICIAL — versión PRE-LLENADA.
 *
 * Se genera al vuelo con los datos reales de la empresa:
 *  · Una fila por cada producto del catálogo (SKU + nombre + precio compra de referencia)
 *  · Columna "almacen" pre-llenada con el primer almacén + dropdown con todos
 *  · El usuario SOLO captura: cantidad y costoUnitario (lote/caducidad opcionales)
 *  · Filas sin cantidad = producto sin stock inicial (el importador las omite)
 *
 * Requiere: npm install exceljs
 */
@Injectable()
export class PlantillaStockInicialService {
  constructor(
    @InjectRepository(Almacen)
    private readonly almacenRepo: Repository<Almacen>,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
  ) {}

  // ── paleta ──
  private readonly VERDE = 'FF047857';
  private readonly VERDE_CLARO = 'FFD1FAE5';
  private readonly GRIS_REF = 'FFF1F5F9'; // columnas informativas (no editar)
  private readonly AMARILLO = 'FFFEF9C3'; // columnas a capturar
  private readonly BORDE = 'FFCBD5E1';

  async generar(empresaId: string): Promise<Buffer> {
    const [almacenes, productos] = await Promise.all([
      this.almacenRepo.find({ where: { empresaId, activo: true }, order: { nombre: 'ASC' } }),
      this.productoRepo.find({ where: { empresaId }, order: { sku: 'ASC' } }),
    ]);
    if (almacenes.length === 0) {
      throw new BadRequestException(
        'Antes de descargar la plantilla de stock inicial crea al menos un almacén activo.',
      );
    }
    const productosActivos = productos.filter((p: any) => p.activo !== false);
    const almacenDefault = almacenes[0]?.nombre ?? '';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SyncroERP';

    // ════════ Hoja principal ════════
    const ws = wb.addWorksheet('StockInicial', {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }], // congela SKU/nombre y encabezados
    });

    ws.columns = [
      { key: 'sku', width: 15 },
      { key: 'nombre', width: 42 },
      { key: 'almacen', width: 24 },
      { key: 'cantidad', width: 11 },
      { key: 'costoUnitario', width: 14 },
      { key: 'precioCompraRef', width: 15 },
      { key: 'lote', width: 14 },
      { key: 'caducidad', width: 12 },
    ];

    // Fila 1: título
    ws.mergeCells('A1:H1');
    const titulo = ws.getCell('A1');
    titulo.value =
      `CARGA DE STOCK INICIAL · ${productosActivos.length} productos de tu catálogo · ` +
      `Captura CANTIDAD y COSTO solo en los productos que tengan existencias. Las filas vacías se omiten.`;
    titulo.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    titulo.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.VERDE },
    };
    titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 30;

    // Fila 2: encabezados (los nombres que lee el importador)
    const headers = [
      'sku',
      'nombre',
      'almacen',
      'cantidad',
      'costoUnitario',
      'precioCompraRef',
      'lote',
      'caducidad',
    ];
    const encabezado = ws.getRow(2);
    headers.forEach((h, i) => {
      const c = encabezado.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.VERDE_CLARO },
      };
      c.border = { bottom: { style: 'medium', color: { argb: this.VERDE } } };
      c.alignment = { horizontal: 'center' };
    });
    encabezado.height = 20;

    // Dropdown de almacenes (lista inline si cabe en el límite de Excel de 255 chars)
    const listaAlmacenes = almacenes.map((a) => a.nombre).join(',');
    const usarDropdown =
      listaAlmacenes.length > 0 && listaAlmacenes.length <= 250;

    // Filas de datos: UNA POR PRODUCTO, pre-llenadas
    productosActivos.forEach((p: any, i) => {
      const r = ws.getRow(i + 3);
      r.getCell(1).value = p.sku;
      r.getCell(2).value = p.nombre;
      r.getCell(3).value = almacenDefault;
      // cantidad (4) y costoUnitario (5) vacíos: los captura el usuario
      r.getCell(6).value = Number(p.precioCompra ?? 0) || null; // referencia del fallback
      // estilos por tipo de columna
      [1, 2, 6].forEach((col) => {
        r.getCell(col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: this.GRIS_REF },
        };
        r.getCell(col).font = { color: { argb: 'FF475569' }, size: 10 };
      });
      [4, 5].forEach((col) => {
        r.getCell(col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: this.AMARILLO },
        };
      });
      for (let col = 1; col <= 8; col++) {
        r.getCell(col).border = {
          bottom: { style: 'hair', color: { argb: this.BORDE } },
          right: { style: 'hair', color: { argb: this.BORDE } },
        };
      }
      r.getCell(6).numFmt = '#,##0.00';
      r.getCell(4).dataValidation = {
        type: 'decimal',
        operator: 'greaterThan',
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Cantidad inválida',
        error: 'Debe ser un número mayor a 0 (o deja vacío si no hay stock).',
      };
      r.getCell(5).dataValidation = {
        type: 'decimal',
        operator: 'greaterThan',
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Costo inválido',
        error:
          'Número mayor a 0. Vacío = se usa el precio de compra (columna de referencia).',
      };
      if (usarDropdown) {
        r.getCell(3).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${listaAlmacenes}"`],
          showErrorMessage: true,
          errorTitle: 'Almacén no válido',
          error: 'Elige un almacén de la lista.',
        };
      }
    });

    ws.autoFilter = { from: 'A2', to: `H${productosActivos.length + 2}` };

    // ════════ Hoja Almacenes ════════
    const wsAlm = wb.addWorksheet('Almacenes');
    wsAlm.getCell('A1').value = 'Almacenes válidos (nombres exactos)';
    wsAlm.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsAlm.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.VERDE },
    };
    wsAlm.getColumn(1).width = 36;
    almacenes.forEach((a, i) => {
      wsAlm.getCell(`A${i + 2}`).value = a.nombre;
    });

    // ════════ Hoja Instrucciones ════════
    const wsInst = wb.addWorksheet('Instrucciones');
    wsInst.getColumn(1).width = 100;
    const lineas = [
      'CÓMO LLENAR ESTA PLANTILLA',
      '',
      '· La plantilla ya trae TODOS los productos de tu catálogo (columnas grises = solo referencia, no las edites).',
      '· Captura CANTIDAD y COSTO UNITARIO (columnas amarillas) solo en los productos con existencias.',
      '· Deja la cantidad vacía en los productos SIN stock: esas filas se omiten automáticamente.',
      '· costoUnitario vacío = se usa el precio de compra del producto (columna precioCompraRef).',
      '· almacen: elige de la lista desplegable. Si un producto está en varios almacenes,',
      '  duplica su fila (copia/pega) y cambia el almacén en la copia.',
      '· lote y caducidad (AAAA-MM-DD): solo si el producto los maneja.',
      '',
      'AL APLICAR, EL SISTEMA:',
      '· Registra las entradas de inventario en cada almacén.',
      '· Genera UNA póliza contable: Cargo a Inventario / Abono a 399-01 Carga de saldos iniciales.',
      '· Esa cuenta puente la cancela tu contador contra capital al terminar la carga de saldos.',
      '',
      'Valida sin guardar primero; aplica solo cuando haya 0 errores.',
    ];
    lineas.forEach((l, i) => {
      const c = wsInst.getCell(`A${i + 1}`);
      c.value = l;
      if (l === 'CÓMO LLENAR ESTA PLANTILLA' || l === 'AL APLICAR, EL SISTEMA:')
        c.font = { bold: true, size: 12 };
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
