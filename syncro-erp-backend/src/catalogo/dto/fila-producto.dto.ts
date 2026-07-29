/**
 * Representa una fila leída del Excel de carga masiva.
 * Los nombres coinciden con los encabezados de la plantilla y con las
 * propiedades de la entidad Producto. Los campos _* son de uso interno
 * (se llenan durante el procesamiento, no vienen del Excel).
 */
export class FilaProductoDto {
  // ── Identificación ──
  sku!: string;
  nombre!: string;
  nombreCorto?: string;
  codigoBarras?: string;
  codigoProveedor?: string;
  descripcion?: string;

  // ── Clasificación ──
  tipoProducto!: string; // FISICO | SERVICIO | CONSUMIBLE | KIT | MATERIA_PRIMA
  categoria?: string; // nombre (se resuelve a categoriaId)
  marca?: string; // nombre (se resuelve a marcaId)
  unidadMedida!: string; // nombre (se resuelve a unidadMedidaId o texto según entidad)
  claveUnidadSAT?: string;
  impuesto?: string; // nombre (se resuelve a impuestoId)

  // ── Costos y precios ──
  precioCompra?: number;
  monedaCosto?: string; // MXN | USD | EUR
  tipoCosto?: string; // PROMEDIO | ESTANDAR | FIFO | LIFO | ESPECIFICO
  precioVenta?: number;

  // ── Almacén / logística ──
  condicionAlmacen?: string; // AMBIENTE | REFRIGERADO | CONGELADO | CONTROLADO | INFLAMABLE
  pesoKg?: number;
  stockMinimo?: number;
  stockMaximo?: number;
  puntoReorden?: number;
  permiteVentaSinStock?: string; // SI | NO
  requiereLote?: string; // SI | NO
  requiereCaducidad?: string; // SI | NO

  activo?: string; // SI | NO

  // ── Campos internos (no vienen del Excel) ──
  _ids?: Record<string, string>; // marcaId, categoriaId, impuestoId, ...
  _productoId?: string; // id del producto creado/actualizado
}
