import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/** Genera una plantilla XLSX sin depender de SheetJS/xlsx. */
@Injectable()
export class PlantillaInventarioService {
  private readonly columnas = [
    'sku', 'nombre', 'nombreCorto', 'codigoBarras', 'codigoProveedor',
    'descripcion', 'tipoProducto', 'categoria', 'marca', 'unidadMedida',
    'claveUnidadSAT', 'impuesto', 'precioCompra', 'monedaCosto', 'tipoCosto',
    'precioVenta', 'condicionAlmacen', 'pesoKg', 'stockMinimo', 'stockMaximo',
    'puntoReorden', 'permiteVentaSinStock', 'requiereLote',
    'requiereCaducidad', 'activo',
  ];

  private readonly ejemplo: Record<string, unknown> = {
    sku: 'SKU-00123',
    nombre: 'Taladro Inalámbrico 20V',
    nombreCorto: 'Taladro 20V',
    codigoBarras: '7501234567890',
    codigoProveedor: 'PROV-TAL-20',
    descripcion: 'Taladro inalámbrico con batería de litio 20V',
    tipoProducto: 'FISICO',
    categoria: 'Herramientas',
    marca: 'DeWalt',
    unidadMedida: 'PIEZA',
    claveUnidadSAT: 'H87',
    impuesto: 'IVA 16%',
    precioCompra: 850,
    monedaCosto: 'MXN',
    tipoCosto: 'PROMEDIO',
    precioVenta: 1299,
    condicionAlmacen: 'AMBIENTE',
    pesoKg: 1.8,
    stockMinimo: 5,
    stockMaximo: 100,
    puntoReorden: 10,
    permiteVentaSinStock: 'NO',
    requiereLote: 'NO',
    requiereCaducidad: 'NO',
    activo: 'SI',
  };

  private readonly instrucciones = [
    'Instrucciones — Carga masiva de inventario',
    '',
    'El SKU es el identificador: si ya existe se ACTUALIZA; si no, se CREA.',
    'Borra la fila de ejemplo antes de importar.',
    'En categoría, marca e impuesto escribe el NOMBRE, no un ID.',
    '',
    'Obligatorios: sku, nombre, tipoProducto, unidadMedida.',
    '',
    'tipoProducto: FISICO, SERVICIO, CONSUMIBLE, KIT, MATERIA_PRIMA',
    'monedaCosto: MXN, USD, EUR',
    'tipoCosto: PROMEDIO, ESTANDAR, FIFO, LIFO, ESPECIFICO',
    'condicionAlmacen: AMBIENTE, REFRIGERADO, CONGELADO, CONTROLADO, INFLAMABLE',
    'Los campos booleanos aceptan SI o NO.',
    '',
    'Este archivo carga únicamente el catálogo. Las existencias iniciales se cargan desde Inventario para generar sus movimientos y póliza.',
  ];

  async generar(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SyncroERP';
    workbook.created = new Date();

    const productos = workbook.addWorksheet('Productos', {
      views: [{ state: 'frozen', ySplit: 2 }],
    });
    productos.mergeCells(1, 1, 1, this.columnas.length);
    productos.getCell(1, 1).value =
      'PLANTILLA DE CARGA MASIVA DE INVENTARIO — borra la fila de ejemplo antes de cargar';
    productos.getCell(1, 1).font = { bold: true, size: 12 };
    productos.getCell(1, 1).alignment = { vertical: 'middle' };
    productos.getRow(2).values = this.columnas;
    productos.getRow(2).font = { bold: true };
    const filaEjemplo: ExcelJS.CellValue[] = this.columnas.map(
      (columna) => (this.ejemplo[columna] ?? '') as ExcelJS.CellValue,
    );
    productos.getRow(3).values = filaEjemplo;
    productos.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2, column: this.columnas.length },
    };
    productos.columns.forEach((columna, indice) => {
      const nombre = this.columnas[indice] ?? '';
      columna.width = Math.min(42, Math.max(14, nombre.length + 4));
    });
    productos.getColumn('M').numFmt = '#,##0.00';
    productos.getColumn('P').numFmt = '#,##0.00';

    const instrucciones = workbook.addWorksheet('Instrucciones');
    for (const texto of this.instrucciones) instrucciones.addRow([texto]);
    instrucciones.getColumn(1).width = 110;
    instrucciones.getRow(1).font = { bold: true, size: 14 };
    instrucciones.getColumn(1).alignment = { wrapText: true, vertical: 'top' };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
