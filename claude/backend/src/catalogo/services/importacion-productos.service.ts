import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';

import { Producto } from '../entities/producto.entity';
import { ListaPrecio } from '../entities/lista-precio.entity';
import { ProductoPrecio } from '../entities/producto-precio.entity';
import { FilaProductoDto } from '../dto/fila-producto.dto';
import {
  CatalogosCache,
  ErrorFila,
  MensajeParcial,
  ResultadoImportacion,
} from '../importacion.types';

// Servicios existentes del catálogo que se reutilizan.
import { MarcaService } from './marca.service';
import { CategoriasService } from './categorias.service';
import { ImpuestoService } from './impuesto.service';
import { UnidadesMedidaService } from './unidades-medida.service';

// NOTA: AlmacenesService e InventarioService se retiraron a propósito.
// Este importador NO toca existencias (ver nota contable en procesar()).

/**
 * Importador masivo de productos desde Excel.
 *
 * Flujo: parsear → validar → resolver relaciones por nombre →
 * (modo validar: reporte) | (modo aplicar: upsert transaccional + stock inicial).
 *
 * Reglas clave:
 *  - Identificador de negocio: SKU (la entidad tiene @Unique(['empresaId','sku'])).
 *    Si el SKU existe → actualiza; si no → crea (upsert). Reimportar no duplica.
 *  - Relaciones (marca/categoría/impuesto/almacén) se resuelven por NOMBRE.
 *  - Política configurable: marca y categoría se crean al vuelo (advertencia);
 *    unidad de medida e impuesto deben existir (error) por su implicación fiscal.
 */
@Injectable()
export class ImportacionProductosService {
  // Política de creación al vuelo por relación. Ajustar según acuerdo del equipo.
  private readonly crearAlVuelo = {
    marca: true,
    categoria: true,
    impuesto: false,
    unidadMedida: false,
  };

  private readonly ENUMS: Record<string, string[]> = {
    tipoProducto: ['FISICO', 'SERVICIO', 'CONSUMIBLE', 'KIT', 'MATERIA_PRIMA'],
    monedaCosto: ['MXN', 'USD', 'EUR'],
    tipoCosto: ['PROMEDIO', 'ESTANDAR', 'FIFO', 'LIFO', 'ESPECIFICO'],
    condicionAlmacen: [
      'AMBIENTE',
      'REFRIGERADO',
      'CONGELADO',
      'CONTROLADO',
      'INFLAMABLE',
    ],
  };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
    private readonly marcas: MarcaService,
    private readonly categorias: CategoriasService,
    private readonly impuestos: ImpuestoService,
    private readonly unidades: UnidadesMedidaService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Orquestación
  // ─────────────────────────────────────────────────────────────
  async procesar(
    buffer: Buffer,
    empresaId: string,
    modo: 'validar' | 'aplicar' = 'aplicar',
  ): Promise<ResultadoImportacion> {
    // 1· PARSEAR
    const filas = await this.parsear(buffer);

    const errores: ErrorFila[] = [];
    const advertencias: ErrorFila[] = [];
    const validas: { fila: number; dto: FilaProductoDto }[] = [];

    // 2· VALIDAR cada fila (obligatorios, enums, tipos)
    filas.forEach((dto, i) => {
      const nFila = i + 4; // fila 1 leyenda, 2 encabezados, 3 ejemplo → datos desde 4
      const errs = this.validarFila(dto, nFila);
      if (errs.length) errores.push(...errs);
      else validas.push({ fila: nFila, dto });
    });

    // 3· RESOLVER relaciones por nombre (crea al vuelo lo permitido)
    const ctx = await this.cargarCatalogos(empresaId);
    const aplicables: { fila: number; dto: FilaProductoDto }[] = [];
    for (const v of validas) {
      const res = await this.resolverRelaciones(v.dto, ctx, empresaId);
      if (res.errores.length) {
        errores.push(
          ...res.errores.map((e) => ({ ...e, fila: v.fila, sku: v.dto.sku })),
        );
        continue;
      }
      if (res.advertencias.length) {
        advertencias.push(
          ...res.advertencias.map((a) => ({
            ...a,
            fila: v.fila,
            sku: v.dto.sku,
          })),
        );
      }
      v.dto._ids = res.ids;
      aplicables.push(v);
    }

    // Modo validar: reporte sin tocar la base de datos
    if (modo === 'validar') {
      return this.armarReporte(
        'validar',
        filas.length,
        0,
        0,
        errores,
        advertencias,
      );
    }

    // 4· UPSERT por SKU dentro de una transacción
    let creados = 0;
    let actualizados = 0;
    await this.dataSource.transaction(async (em) => {
      const requiereListaPrecio = aplicables.some(
        ({ dto }) => dto.precioVenta !== undefined,
      );
      const listaPrecioId = requiereListaPrecio
        ? await this.asegurarListaPrecioDefault(em, empresaId)
        : undefined;
      for (const { dto } of aplicables) {
        const existente = await em.findOne(Producto, {
          where: { empresaId, sku: dto.sku },
        });

        if (existente) {
          await em.update(Producto, existente.id, this.aEntidad(dto));
          dto._productoId = existente.id;
          actualizados++;
        } else {
          const nuevo = em.create(Producto, {
            ...this.aEntidad(dto),
            empresaId,
          });
          const guardado = await em.save(nuevo);
          dto._productoId = guardado.id;
          creados++;
        }

        // `precioVenta` pertenece a productos_precios, no a Producto. Antes
        // se leía del Excel pero se descartaba silenciosamente aquí.
        if (dto.precioVenta !== undefined && listaPrecioId) {
          let precio = await em.findOne(ProductoPrecio, {
            where: {
              productoId: dto._productoId!,
              listaPrecioId,
            },
          });
          precio ??= em.create(ProductoPrecio, {
            productoId: dto._productoId!,
            listaPrecioId,
          });
          precio.precio = Number(dto.precioVenta);
          await em.save(precio);
        }

        // NOTA CONTABLE (estilo SAP):
        // Este importador crea/actualiza SOLO el material maestro (catálogo).
        // NO carga existencias, porque meter inventario valorizado sin su
        // asiento contable descuadraría el balance (Inventario es un activo).
        // La carga de stock inicial debe hacerse por el canal contable
        // correcto (ver README, sección "Stock inicial"), que genera el
        // asiento Dr. Inventario / Cr. contrapartida — equivalente al
        // movimiento 561 de SAP. Aquí NO se toca stock a propósito.
      }
    });

    return this.armarReporte(
      'aplicar',
      filas.length,
      creados,
      actualizados,
      errores,
      advertencias,
    );
  }

  private async asegurarListaPrecioDefault(
    em: EntityManager,
    empresaId: string,
  ): Promise<string> {
    let lista = await em.findOne(ListaPrecio, {
      where: { empresaId, esPorDefecto: true },
    });
    if (lista) return lista.id;

    lista = await em.findOne(ListaPrecio, {
      where: { empresaId },
      order: { nombre: 'ASC' },
    });
    if (lista) {
      lista.esPorDefecto = true;
      return (await em.save(lista)).id;
    }

    return (
      await em.save(
        em.create(ListaPrecio, {
          empresaId,
          nombre: 'Público General',
          esPorDefecto: true,
        }),
      )
    ).id;
  }

  // ─────────────────────────────────────────────────────────────
  // 1· Parseo
  // ─────────────────────────────────────────────────────────────
  private async parsear(buffer: Buffer): Promise<FilaProductoDto[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const hoja = workbook.getWorksheet('Productos') ?? workbook.worksheets[0];
    if (!hoja) return [];

    const texto = (valor: ExcelJS.CellValue): unknown => {
      if (valor == null) return null;
      if (valor instanceof Date) return valor;
      if (typeof valor !== 'object') return valor;
      if ('result' in valor) return valor.result ?? null;
      if ('text' in valor && typeof valor.text === 'string') return valor.text;
      if ('richText' in valor && Array.isArray(valor.richText)) {
        return valor.richText.map((segmento) => segmento.text).join('');
      }
      return String(valor);
    };

    const encabezados = new Map<number, string>();
    hoja.getRow(2).eachCell({ includeEmpty: false }, (celda, columna) => {
      const nombre = String(texto(celda.value) ?? '').trim();
      if (nombre) encabezados.set(columna, nombre);
    });
    if (!encabezados.size) return [];

    const filas: FilaProductoDto[] = [];
    for (let numero = 3; numero <= hoja.rowCount; numero++) {
      const row = hoja.getRow(numero);
      const objeto: Record<string, unknown> = {};
      let tieneValor = false;
      for (const [columna, nombre] of encabezados) {
        const valor = texto(row.getCell(columna).value);
        objeto[nombre] = valor;
        if (valor != null && String(valor).trim() !== '') tieneValor = true;
      }
      if (!tieneValor) continue;
      const dto = this.aFilaDto(objeto);
      if (numero === 3 && this.esFilaEjemplo(dto)) continue;
      filas.push(dto);
    }
    return filas;
  }

  private esFilaEjemplo(dto: FilaProductoDto): boolean {
    // La plantilla trae "SKU-00123" como ejemplo; si el usuario no la borró, la ignoramos.
    return dto.sku === 'SKU-00123';
  }

  private aFilaDto(f: Record<string, any>): FilaProductoDto {
    const g = (k: string) => (f[k] != null ? f[k] : undefined);
    const s = (k: string) => (g(k) != null ? String(g(k)).trim() : undefined);
    const n = (k: string) =>
      g(k) != null && g(k) !== '' ? Number(g(k)) : undefined;
    return {
      sku: s('sku'),
      nombre: s('nombre'),
      nombreCorto: s('nombreCorto'),
      codigoBarras: s('codigoBarras'),
      codigoProveedor: s('codigoProveedor'),
      descripcion: s('descripcion'),
      tipoProducto: s('tipoProducto')?.toUpperCase(),
      categoria: s('categoria'),
      marca: s('marca'),
      unidadMedida: s('unidadMedida'),
      claveUnidadSAT: s('claveUnidadSAT'),
      impuesto: s('impuesto'),
      precioCompra: n('precioCompra'),
      monedaCosto: s('monedaCosto')?.toUpperCase(),
      tipoCosto: s('tipoCosto')?.toUpperCase(),
      precioVenta: n('precioVenta'),
      condicionAlmacen: s('condicionAlmacen')?.toUpperCase(),
      pesoKg: n('pesoKg'),
      stockMinimo: n('stockMinimo'),
      stockMaximo: n('stockMaximo'),
      puntoReorden: n('puntoReorden'),
      permiteVentaSinStock: s('permiteVentaSinStock')?.toUpperCase(),
      requiereLote: s('requiereLote')?.toUpperCase(),
      requiereCaducidad: s('requiereCaducidad')?.toUpperCase(),
      activo: s('activo')?.toUpperCase(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 2· Validación
  // ─────────────────────────────────────────────────────────────
  private validarFila(d: FilaProductoDto, fila: number): ErrorFila[] {
    const e: ErrorFila[] = [];
    const req = (campo: string, val: any) => {
      if (val == null || String(val).trim() === '')
        e.push({
          fila,
          sku: d.sku,
          campo,
          mensaje: `'${campo}' es obligatorio`,
        });
    };

    req('sku', d.sku);
    req('nombre', d.nombre);
    req('tipoProducto', d.tipoProducto);
    req('unidadMedida', d.unidadMedida);

    for (const [campo, permitidos] of Object.entries(this.ENUMS)) {
      const v = (d as any)[campo];
      if (v && !permitidos.includes(String(v).toUpperCase()))
        e.push({
          fila,
          sku: d.sku,
          campo,
          mensaje: `'${v}' no es válido en ${campo}; use: ${permitidos.join(', ')}`,
        });
    }

    const num = (campo: string) => {
      const v = (d as any)[campo];
      if (v != null && v !== '' && isNaN(Number(v)))
        e.push({
          fila,
          sku: d.sku,
          campo,
          mensaje: `'${campo}' debe ser numérico`,
        });
    };
    [
      'precioCompra',
      'precioVenta',
      'pesoKg',
      'stockMinimo',
      'stockMaximo',
      'puntoReorden',
    ].forEach(num);

    if (d.precioVenta !== undefined && Number(d.precioVenta) <= 0) {
      e.push({
        fila,
        sku: d.sku,
        campo: 'precioVenta',
        mensaje: "'precioVenta' debe ser mayor que cero cuando se captura",
      });
    }
    if (d.precioCompra !== undefined && Number(d.precioCompra) < 0) {
      e.push({
        fila,
        sku: d.sku,
        campo: 'precioCompra',
        mensaje: "'precioCompra' no puede ser negativo",
      });
    }

    return e;
  }

  // ─────────────────────────────────────────────────────────────
  // 3· Resolución de relaciones por nombre
  // ─────────────────────────────────────────────────────────────
  private async resolverRelaciones(
    d: FilaProductoDto,
    ctx: CatalogosCache,
    empresaId: string,
  ): Promise<{
    ids: Record<string, string>;
    errores: MensajeParcial[];
    advertencias: MensajeParcial[];
  }> {
    const ids: Record<string, string> = {};
    const errores: MensajeParcial[] = [];
    const advertencias: MensajeParcial[] = [];

    const resolver = async (
      mapa: Map<string, string>,
      nombre: string | undefined,
      campo: keyof typeof this.crearAlVuelo,
      crear: (nombre: string) => Promise<string>,
      obligatorio = false,
    ) => {
      if (!nombre) {
        if (obligatorio)
          errores.push({
            mensaje: `'${campo}' es obligatorio`,
            campo: String(campo),
          });
        return;
      }
      const clave = nombre.trim().toLowerCase();
      const existente = mapa.get(clave);
      if (existente) {
        ids[`${campo}Id`] = existente;
        return;
      }
      if (this.crearAlVuelo[campo]) {
        const nuevoId = await crear(nombre.trim());
        mapa.set(clave, nuevoId); // cachear para filas siguientes
        ids[`${campo}Id`] = nuevoId;
        advertencias.push({
          mensaje: `${String(campo)} '${nombre}' no existía; se creó automáticamente`,
          campo: String(campo),
        });
      } else {
        errores.push({
          mensaje: `${String(campo)} '${nombre}' no existe en el catálogo`,
          campo: String(campo),
        });
      }
    };

    // unidad de medida: obligatoria, no se crea al vuelo
    await resolver(
      ctx.unidades,
      d.unidadMedida,
      'unidadMedida',
      async () => '',
      true,
    );
    // marca: se crea al vuelo (MarcaService.create(nombre, empresaId))
    await resolver(ctx.marcas, d.marca, 'marca', async (nombre) => {
      const creada = await this.marcas.create(nombre, empresaId);
      return (creada as any).id;
    });
    // categoría: se crea al vuelo (CategoriasService.crearCategoria)
    await resolver(ctx.categorias, d.categoria, 'categoria', async (nombre) => {
      const creada = await this.categorias.crearCategoria(
        { nombre },
        empresaId,
      );
      return (creada as any).id;
    });
    // impuesto: debe existir (implicación fiscal)
    await resolver(ctx.impuestos, d.impuesto, 'impuesto', async () => '');

    return { ids, errores, advertencias };
  }

  // ─────────────────────────────────────────────────────────────
  // Carga de catálogos en memoria (una sola vez)
  // ─────────────────────────────────────────────────────────────
  private async cargarCatalogos(empresaId: string): Promise<CatalogosCache> {
    const idx = (arr: any[], campo = 'nombre') => {
      const m = new Map<string, string>();
      for (const x of arr ?? [])
        if (x?.[campo]) m.set(String(x[campo]).trim().toLowerCase(), x.id);
      return m;
    };

    const [unidades, marcas, categorias, impuestos] = await Promise.all([
      this.unidades.obtenerTodas(empresaId),
      this.marcas.findAll(empresaId),
      this.categorias.obtenerCategorias(empresaId),
      this.impuestos.findAll?.(empresaId) ?? [],
    ]);

    return {
      unidades: idx(unidades),
      marcas: idx(marcas),
      categorias: idx(categorias),
      impuestos: idx(impuestos),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Mapeo fila → entidad Producto (solo campos directos)
  // ─────────────────────────────────────────────────────────────
  private aEntidad(d: FilaProductoDto): Partial<Producto> {
    const bool = (v?: string) => (v == null ? undefined : v === 'SI');
    const ent: any = {
      sku: d.sku,
      nombre: d.nombre,
      nombreCorto: d.nombreCorto,
      codigoBarras: d.codigoBarras,
      codigoProveedor: d.codigoProveedor,
      descripcion: d.descripcion,
      tipo: d.tipoProducto,
      claveUnidadSAT: d.claveUnidadSAT,
      precioCompra: d.precioCompra,
      monedaCosto: d.monedaCosto,
      tipoCosto: d.tipoCosto,
      condicionAlmacen: d.condicionAlmacen,
      pesoKg: d.pesoKg,
      stockMinimo: d.stockMinimo,
      stockMaximo: d.stockMaximo,
      puntoReorden: d.puntoReorden,
      permiteVentaSinStock: bool(d.permiteVentaSinStock),
      requiereLote: bool(d.requiereLote),
      requiereCaducidad: bool(d.requiereCaducidad),
      activo: d.activo == null ? true : d.activo === 'SI',
      // relaciones resueltas
      marcaId: d._ids?.marcaId,
      categoriaId: d._ids?.categoriaId,
      impuestoId: d._ids?.impuestoId,
    };
    // La unidad de medida puede ser texto o relación según la entidad;
    // el proyecto guarda 'unidadMedida' como varchar → se asigna el nombre.
    ent.unidadMedida = d.unidadMedida;

    // Quitar undefined para no sobrescribir con null en el update
    Object.keys(ent).forEach((k) => ent[k] === undefined && delete ent[k]);
    return ent;
  }

  // ─────────────────────────────────────────────────────────────
  // Reporte
  // ─────────────────────────────────────────────────────────────
  private armarReporte(
    modo: 'validar' | 'aplicar',
    totalFilas: number,
    creados: number,
    actualizados: number,
    errores: ErrorFila[],
    advertencias: ErrorFila[],
  ): ResultadoImportacion {
    const skusConError = new Set(errores.map((e) => `${e.fila}-${e.sku}`));
    return {
      modo,
      totalFilas,
      creados,
      actualizados,
      conError: skusConError.size,
      errores,
      advertencias,
    };
  }
}
