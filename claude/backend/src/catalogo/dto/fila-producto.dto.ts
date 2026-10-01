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
  /**
   * ClaveProdServ del SAT. SIN ELLA EL PRODUCTO NO SE PUEDE FACTURAR.
   *
   * Faltaba en la plantilla y en este DTO, y la entidad la declara obligatoria
   * para CFDI 4.0. Resultado medido el 30-sep-2026: seis productos cargados
   * por Excel que no se podían timbrar, y la causa parecía un descuido de
   * captura cuando en realidad la plantilla NUNCA la pidió.
   */
  claveSAT?: string;
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
