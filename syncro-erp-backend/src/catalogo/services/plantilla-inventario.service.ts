import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

/**
 * Genera la plantilla de Excel para la carga masiva de inventario.
 * Devuelve un Buffer listo para enviar como descarga.
 *
 * Nota: la librería `xlsx` (SheetJS) en su edición community no aplica estilos
 * ni validaciones de celda. Esta plantilla incluye encabezados, una fila de
 * ejemplo y una hoja de instrucciones con los valores permitidos. Si se desea
 * una plantilla con colores y listas desplegables nativas, generarla con
 * `exceljs` (permite estilos y dataValidations) o servir el .xlsx pre-diseñado
 * como archivo estático.
 */
@Injectable()
export class PlantillaInventarioService {
  private readonly columnas = [
    'sku',
    'nombre',
    'nombreCorto',
    'codigoBarras',
    'codigoProveedor',
    'descripcion',
    'tipoProducto',
    'categoria',
    'marca',
    'unidadMedida',
    'claveUnidadSAT',
    'impuesto',
    'precioCompra',
    'monedaCosto',
    'tipoCosto',
    'precioVenta',
    'condicionAlmacen',
    'pesoKg',
    'stockMinimo',
    'stockMaximo',
    'puntoReorden',
    'permiteVentaSinStock',
    'requiereLote',
    'requiereCaducidad',
    'activo',
  ];

  private readonly ejemplo: Record<string, any> = {
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

  private readonly instrucciones: string[][] = [
    ['Instrucciones — Carga masiva de inventario'],
    [''],
    ['El SKU es el identificador: si ya existe se ACTUALIZA, si no se CREA (no duplica).'],
    ['Borra la fila de ejemplo antes de importar.'],
    ['En categoría, marca, impuesto y almacén escribe el NOMBRE, no un ID.'],
    [''],
    ['Obligatorios: sku, nombre, tipoProducto, unidadMedida.'],
    [''],
    ['Valores permitidos:'],
    ['tipoProducto: FISICO, SERVICIO, CONSUMIBLE, KIT, MATERIA_PRIMA'],
    ['monedaCosto: MXN, USD, EUR'],
    ['tipoCosto: PROMEDIO, ESTANDAR, FIFO, LIFO, ESPECIFICO'],
    ['condicionAlmacen: AMBIENTE, REFRIGERADO, CONGELADO, CONTROLADO, INFLAMABLE'],
    ['permiteVentaSinStock, requiereLote, requiereCaducidad, activo: SI o NO'],
    [''],
    ['NOTA: este archivo carga SOLO el catálogo (datos del producto).'],
    ['Las existencias iniciales se cargan aparte, por el módulo de inventario,'],
    ['para que generen su movimiento contable (Inventario es un activo).'],
    ['Precios sin símbolo de moneda, punto decimal (ej. 1299.00).'],
  ];

  async generar(): Promise<Buffer> {
    const wb = XLSX.utils.book_new();

    // Hoja Productos: fila de leyenda + encabezados + ejemplo
    const encabezados = this.columnas;
    const filaEjemplo = this.columnas.map((c) => this.ejemplo[c] ?? '');
    const aoa = [
      ['PLANTILLA DE CARGA MASIVA DE INVENTARIO — borra la fila de ejemplo antes de cargar'],
      encabezados,
      filaEjemplo,
    ];
    const wsProd = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, wsProd, 'Productos');

    // Hoja Instrucciones
    const wsInstr = XLSX.utils.aoa_to_sheet(this.instrucciones);
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
