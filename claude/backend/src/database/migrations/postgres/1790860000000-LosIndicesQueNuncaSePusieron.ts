import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Los índices que nunca se pusieron
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Medido contra la base el 10-oct-2026, no deducido:
 *
 *   · **118 claves foráneas sin índice.** Cada JOIN por esa columna y cada
 *     comprobación de integridad recorre la tabla entera.
 *   · **21 tablas con `empresaId` y sin índice por esa columna** — `clientes`
 *     entre ellas. Es la columna por la que filtra absolutamente todo en un
 *     sistema multiempresa: la lista de clientes de una empresa leía las filas
 *     de todas y descartaba las que no eran suyas.
 *   · **El guardia de permisos, que corre en CADA petición**, hacía dos
 *     recorridos secuenciales en cada fallo de caché. Medido con EXPLAIN
 *     ANALYZE sobre la base real:
 *
 *         Seq Scan on endpoints ............... 615 filas descartadas de 616
 *         Seq Scan on rol_endpoint_permisos ... 2072 descartadas de 2072
 *
 * HOY NO DUELE, Y ÉSE ES EL PUNTO
 *
 * Con 616 endpoints y 2 072 permisos, un recorrido secuencial tarda décimas de
 * milisegundo y nadie lo nota. Pero `rol_endpoint_permisos` crece como
 * *empresas × roles × endpoints*: ocho empresas dan 2 072 filas; cien empresas
 * bien sembradas dan cerca de **ochocientas mil**, y entonces cada fallo de
 * caché recorre ochocientas mil filas aplicando cuatro funciones de texto a
 * cada una, en el camino por el que pasa toda petición de todo el mundo.
 *
 * Es decir: el sistema no se pone lento el día que hay mucha gente, se pone
 * lento el día que hay muchas EMPRESAS. Y para entonces el síntoma —«va
 * lento»— no apunta a ninguna línea de código.
 *
 * LOS DOS ÍNDICES ÚNICOS
 *
 * `endpoints(metodo, ruta)` y `rol_endpoint_permisos(empresaid, rol,
 * endpoint_id)` se crean ÚNICOS, comprobado antes de crearlos que no hay
 * duplicados. No es sólo velocidad: dos filas de permiso para el mismo rol
 * sobre el mismo endpoint son dos respuestas posibles a la misma pregunta, y
 * cuál gana depende del orden en que Postgres las devuelva.
 *
 * Añadir un índice no cambia ningún resultado: cambia cuánto tarda en darlo.
 * Si alguno estorbara en el futuro, `down` los quita.
 * ============================================================================
 */
export class LosIndicesQueNuncaSePusieron1790860000000 implements MigrationInterface {
  name = 'LosIndicesQueNuncaSePusieron1790860000000';

  public async up(q: QueryRunner): Promise<void> {
    /* ── La columna por la que filtra TODO: el inquilino ──────────────── */
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_atributo_definiciones_empresaid" ON "atributo_definiciones" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_clientes_empresaid" ON "clientes" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_configuraciones_aprobacion_empresaid" ON "configuraciones_aprobacion" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_crm_historial_etapas_empresaid" ON "crm_historial_etapas" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_departamentos_empresaid" ON "departamentos" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_dotaciones_tipo_habitacion_empresaid" ON "dotaciones_tipo_habitacion" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_habitaciones_empresaid" ON "habitaciones" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_impuestos_empresaid" ON "impuestos" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_integracion_tenants_reserva_empresaid" ON "integracion_tenants_reserva" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_listas_precio_empresaid" ON "listas_precio" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_marcas_empresaid" ON "marcas" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_proveedores_empresaid" ON "proveedores" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_reservaciones_empresaid" ON "reservaciones" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rol_endpoint_permisos_empresaid" ON "rol_endpoint_permisos" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rrhh_aplicaciones_pago_nomina_empresaid" ON "rrhh_aplicaciones_pago_nomina" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rrhh_dispersiones_nomina_detalle_empresaid" ON "rrhh_dispersiones_nomina_detalle" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rrhh_recibos_nomina_empresaid" ON "rrhh_recibos_nomina" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_tareas_housekeeping_empresaid" ON "tareas_housekeeping" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_tesoreria_lineas_estado_cuenta_empresaid" ON "tesoreria_lineas_estado_cuenta" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_tipos_habitacion_empresaid" ON "tipos_habitacion" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_usuarios_empresaid" ON "usuarios" ("empresaid");`);

    /* ── El camino caliente del guardia de permisos ───────────────────── */
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ix_endpoints_metodo_ruta" ON "endpoints" ("metodo", "ruta")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_permisos_empresa_endpoint" ON "rol_endpoint_permisos" ("empresaid", "endpoint_id", "permitido")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ix_permisos_empresa_rol_endpoint" ON "rol_endpoint_permisos" ("empresaid", "rol", "endpoint_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_permisos_empresa_rol" ON "rol_endpoint_permisos" ("empresaid", "rol")`);

    /* ── Claves foráneas sin índice ───────────────────────────────────── */
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_activos_categorias_cuentaactivoid" ON "activos_categorias" ("cuentaactivoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_activos_categorias_cuentadepreciacionacumuladaid" ON "activos_categorias" ("cuentadepreciacionacumuladaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_activos_categorias_cuentagastodepreciacionid" ON "activos_categorias" ("cuentagastodepreciacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_activos_fijos_categoriaid" ON "activos_fijos" ("categoriaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_amortizacion_cuotas_creditoid" ON "amortizacion_cuotas" ("creditoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_aplicaciones_lote_devolucion_detalledevolucionid" ON "aplicaciones_lote_devolucion" ("detalledevolucionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_aplicaciones_lote_devolucion_loteid" ON "aplicaciones_lote_devolucion" ("loteid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_aplicaciones_lote_devolucion_movimientosalidaid" ON "aplicaciones_lote_devolucion" ("movimientosalidaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_aprobaciones_requisicionid" ON "aprobaciones" ("requisicionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_aprobaciones_usuarioid" ON "aprobaciones" ("usuarioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cargos_folio_folioid" ON "cargos_folio" ("folioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_categorias_categoriapadreid" ON "categorias" ("categoriapadreid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_categorias_cuentacostoventasid" ON "categorias" ("cuentacostoventasid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_categorias_cuentadevolucionesid" ON "categorias" ("cuentadevolucionesid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_categorias_cuentainventarioid" ON "categorias" ("cuentainventarioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_categorias_cuentamermasid" ON "categorias" ("cuentamermasid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_categorias_cuentaventasid" ON "categorias" ("cuentaventasid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_configuraciones_aprobacion_departamentoid" ON "configuraciones_aprobacion" ("departamentoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_configuraciones_aprobacion_usuarioid" ON "configuraciones_aprobacion" ("usuarioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_conteos_inventario_almacenid" ON "conteos_inventario" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_conteos_inventario_detalle_loteid" ON "conteos_inventario_detalle" ("loteid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_conteos_inventario_detalle_productoid" ON "conteos_inventario_detalle" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_conteos_inventario_detalle_ubicacionid" ON "conteos_inventario_detalle" ("ubicacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cotizaciones_aprobadoporid" ON "cotizaciones" ("aprobadoporid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cotizaciones_proveedorid" ON "cotizaciones" ("proveedorid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cotizaciones_requisicionid" ON "cotizaciones" ("requisicionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cotizaciones_solicitadoaprobacionporid" ON "cotizaciones" ("solicitadoaprobacionporid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_crm_oportunidades_etapaid" ON "crm_oportunidades" ("etapaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_crm_oportunidades_prospectoid" ON "crm_oportunidades" ("prospectoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_bancarias_almacenid" ON "cuentas_bancarias" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_bancarias_bancoid" ON "cuentas_bancarias" ("bancoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_bancarias_cuentacontableid" ON "cuentas_bancarias" ("cuentacontableid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_bancarias_listaprecioid" ON "cuentas_bancarias" ("listaprecioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_contables_cuentapadreid" ON "cuentas_contables" ("cuentapadreid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_contables_sat_mapeos_cuentacontableid" ON "cuentas_contables_sat_mapeos" ("cuentacontableid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_contables_sat_mapeos_entradaid" ON "cuentas_contables_sat_mapeos" ("entradaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_cuentas_contables_sat_mapeos_versionid" ON "cuentas_contables_sat_mapeos" ("versionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_cotizacion_cotizacionid" ON "detalles_cotizacion" ("cotizacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_cotizacion_productoid" ON "detalles_cotizacion" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_devolucion_venta_detalleventaid" ON "detalles_devolucion_venta" ("detalleventaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_devolucion_venta_devolucionid" ON "detalles_devolucion_venta" ("devolucionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_devolucion_venta_productoid" ON "detalles_devolucion_venta" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_orden_compra_ordencompraid" ON "detalles_orden_compra" ("ordencompraid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_orden_compra_productoid" ON "detalles_orden_compra" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_requisicion_productoid" ON "detalles_requisicion" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_requisicion_requisicionid" ON "detalles_requisicion" ("requisicionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_venta_productoid" ON "detalles_venta" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_detalles_venta_ventaid" ON "detalles_venta" ("ventaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_devoluciones_venta_cuentabancariaid" ON "devoluciones_venta" ("cuentabancariaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_devoluciones_venta_ventaid" ON "devoluciones_venta" ("ventaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_dotaciones_tipo_habitacion_tipohabitacionid" ON "dotaciones_tipo_habitacion" ("tipohabitacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_endpoints_controlador_id" ON "endpoints" ("controlador_id");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_facturas_cfdirelacionadoid" ON "facturas" ("cfdirelacionadoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_facturas_clienteid" ON "facturas" ("clienteid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_facturas_ventaid" ON "facturas" ("ventaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_folios_reservacionid" ON "folios" ("reservacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_habitaciones_tipohabitacionid" ON "habitaciones" ("tipohabitacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_imagenes_producto_productoid" ON "imagenes_producto" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_lotes_inventario_almacenid" ON "lotes_inventario" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_lotes_inventario_productoid" ON "lotes_inventario" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_movimientos_inventario_almacen_id" ON "movimientos_inventario" ("almacen_id");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_ordenes_compra_cotizacionid" ON "ordenes_compra" ("cotizacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_ordenes_compra_proveedorid" ON "ordenes_compra" ("proveedorid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_pagos_cobranza_complementopagoid" ON "pagos_cobranza" ("complementopagoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_pagos_cobranza_creditoid" ON "pagos_cobranza" ("creditoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_pagos_folio_hotel_cuentabancariaid" ON "pagos_folio_hotel" ("cuentabancariaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_pagos_folio_hotel_folioid" ON "pagos_folio_hotel" ("folioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_pagos_proveedor_ordencompraid" ON "pagos_proveedor" ("ordencompraid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_partidas_factura_facturaid" ON "partidas_factura" ("facturaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_partidas_poliza_cuentacontableid" ON "partidas_poliza" ("cuentacontableid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_partidas_poliza_polizaid" ON "partidas_poliza" ("polizaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_producto_ubicaciones_almacenid" ON "producto_ubicaciones" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_producto_ubicaciones_productoid" ON "producto_ubicaciones" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_producto_ubicaciones_ubicacionid" ON "producto_ubicaciones" ("ubicacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_categoriaid" ON "productos" ("categoriaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_impuestoid" ON "productos" ("impuestoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_marcaid" ON "productos" ("marcaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_equivalencias_equivalenciabaseid" ON "productos_equivalencias" ("equivalenciabaseid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_equivalencias_productoid" ON "productos_equivalencias" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_precios_listaprecioid" ON "productos_precios" ("listaprecioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_productos_precios_productoid" ON "productos_precios" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_proveedores_bancoid" ON "proveedores" ("bancoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_proveedores_estadoid" ON "proveedores" ("estadoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_proveedores_formapagoid" ON "proveedores" ("formapagoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_proveedores_paisid" ON "proveedores" ("paisid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_recepciones_compra_ordencompraid" ON "recepciones_compra" ("ordencompraid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_recepciones_compra_detalle_detalleordencompraid" ON "recepciones_compra_detalle" ("detalleordencompraid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_recepciones_compra_detalle_recepcionid" ON "recepciones_compra_detalle" ("recepcionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_recetas_insumos_recetaid" ON "recetas_insumos" ("recetaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_requisiciones_usuariosolicitanteid" ON "requisiciones" ("usuariosolicitanteid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_reservaciones_habitacionid" ON "reservaciones" ("habitacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_reservaciones_hotelid" ON "reservaciones" ("hotelid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_reservaciones_tipohabitacionid" ON "reservaciones" ("tipohabitacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_reservas_inventario_almacenid" ON "reservas_inventario" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_reservas_inventario_productoid" ON "reservas_inventario" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rol_endpoint_permisos_endpoint_id" ON "rol_endpoint_permisos" ("endpoint_id");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rrhh_empleados_puestoid" ON "rrhh_empleados" ("puestoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rrhh_partidas_recibo_reciboid" ON "rrhh_partidas_recibo" ("reciboid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_rrhh_puestos_departamentoid" ON "rrhh_puestos" ("departamentoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_stock_por_almacen_almacenid" ON "stock_por_almacen" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_stock_por_almacen_productoid" ON "stock_por_almacen" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_stock_ubicaciones_almacenid" ON "stock_ubicaciones" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_stock_ubicaciones_loteid" ON "stock_ubicaciones" ("loteid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_stock_ubicaciones_productoid" ON "stock_ubicaciones" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_stock_ubicaciones_ubicacionid" ON "stock_ubicaciones" ("ubicacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_tareas_housekeeping_habitacionid" ON "tareas_housekeeping" ("habitacionid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_tipos_habitacion_hotelid" ON "tipos_habitacion" ("hotelid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_transferencias_inventario_almacendestinoid" ON "transferencias_inventario" ("almacendestinoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_transferencias_inventario_almacenorigenid" ON "transferencias_inventario" ("almacenorigenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_transferencias_inventario_detalle_productoid" ON "transferencias_inventario_detalle" ("productoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_transferencias_inventario_detalle_ubicaciondestinoid" ON "transferencias_inventario_detalle" ("ubicaciondestinoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_transferencias_inventario_detalle_ubicacionorigenid" ON "transferencias_inventario_detalle" ("ubicacionorigenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_ubicaciones_almacen_almacenid" ON "ubicaciones_almacen" ("almacenid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_usuarios_departamentoid" ON "usuarios" ("departamentoid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_usuarios_empresaid" ON "usuarios" ("empresaid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_ventas_clienteid" ON "ventas" ("clienteid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_ventas_listaprecioid" ON "ventas" ("listaprecioid");`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_ventas_usuarioid" ON "ventas" ("usuarioid");`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "ix_atributo_definiciones_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_clientes_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_configuraciones_aprobacion_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_crm_historial_etapas_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_departamentos_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_dotaciones_tipo_habitacion_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_habitaciones_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_impuestos_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_integracion_tenants_reserva_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_listas_precio_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_marcas_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_proveedores_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_reservaciones_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rol_endpoint_permisos_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rrhh_aplicaciones_pago_nomina_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rrhh_dispersiones_nomina_detalle_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rrhh_recibos_nomina_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_tareas_housekeeping_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_tesoreria_lineas_estado_cuenta_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_tipos_habitacion_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_usuarios_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_activos_categorias_cuentaactivoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_activos_categorias_cuentadepreciacionacumuladaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_activos_categorias_cuentagastodepreciacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_activos_fijos_categoriaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_amortizacion_cuotas_creditoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_aplicaciones_lote_devolucion_detalledevolucionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_aplicaciones_lote_devolucion_loteid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_aplicaciones_lote_devolucion_movimientosalidaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_aprobaciones_requisicionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_aprobaciones_usuarioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cargos_folio_folioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_categorias_categoriapadreid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_categorias_cuentacostoventasid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_categorias_cuentadevolucionesid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_categorias_cuentainventarioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_categorias_cuentamermasid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_categorias_cuentaventasid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_configuraciones_aprobacion_departamentoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_configuraciones_aprobacion_usuarioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_conteos_inventario_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_conteos_inventario_detalle_loteid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_conteos_inventario_detalle_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_conteos_inventario_detalle_ubicacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cotizaciones_aprobadoporid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cotizaciones_proveedorid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cotizaciones_requisicionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cotizaciones_solicitadoaprobacionporid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_crm_oportunidades_etapaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_crm_oportunidades_prospectoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_bancarias_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_bancarias_bancoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_bancarias_cuentacontableid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_bancarias_listaprecioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_contables_cuentapadreid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_contables_sat_mapeos_cuentacontableid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_contables_sat_mapeos_entradaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_cuentas_contables_sat_mapeos_versionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_cotizacion_cotizacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_cotizacion_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_devolucion_venta_detalleventaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_devolucion_venta_devolucionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_devolucion_venta_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_orden_compra_ordencompraid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_orden_compra_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_requisicion_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_requisicion_requisicionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_venta_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_detalles_venta_ventaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_devoluciones_venta_cuentabancariaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_devoluciones_venta_ventaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_dotaciones_tipo_habitacion_tipohabitacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_endpoints_controlador_id"`);
    await q.query(`DROP INDEX IF EXISTS "ix_facturas_cfdirelacionadoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_facturas_clienteid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_facturas_ventaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_folios_reservacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_habitaciones_tipohabitacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_imagenes_producto_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_lotes_inventario_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_lotes_inventario_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_movimientos_inventario_almacen_id"`);
    await q.query(`DROP INDEX IF EXISTS "ix_ordenes_compra_cotizacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_ordenes_compra_proveedorid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_pagos_cobranza_complementopagoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_pagos_cobranza_creditoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_pagos_folio_hotel_cuentabancariaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_pagos_folio_hotel_folioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_pagos_proveedor_ordencompraid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_partidas_factura_facturaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_partidas_poliza_cuentacontableid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_partidas_poliza_polizaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_producto_ubicaciones_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_producto_ubicaciones_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_producto_ubicaciones_ubicacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_categoriaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_impuestoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_marcaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_equivalencias_equivalenciabaseid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_equivalencias_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_precios_listaprecioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_productos_precios_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_proveedores_bancoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_proveedores_estadoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_proveedores_formapagoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_proveedores_paisid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_recepciones_compra_ordencompraid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_recepciones_compra_detalle_detalleordencompraid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_recepciones_compra_detalle_recepcionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_recetas_insumos_recetaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_requisiciones_usuariosolicitanteid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_reservaciones_habitacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_reservaciones_hotelid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_reservaciones_tipohabitacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_reservas_inventario_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_reservas_inventario_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rol_endpoint_permisos_endpoint_id"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rrhh_empleados_puestoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rrhh_partidas_recibo_reciboid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_rrhh_puestos_departamentoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_stock_por_almacen_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_stock_por_almacen_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_stock_ubicaciones_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_stock_ubicaciones_loteid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_stock_ubicaciones_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_stock_ubicaciones_ubicacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_tareas_housekeeping_habitacionid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_tipos_habitacion_hotelid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_transferencias_inventario_almacendestinoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_transferencias_inventario_almacenorigenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_transferencias_inventario_detalle_productoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_transferencias_inventario_detalle_ubicaciondestinoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_transferencias_inventario_detalle_ubicacionorigenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_ubicaciones_almacen_almacenid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_usuarios_departamentoid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_usuarios_empresaid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_ventas_clienteid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_ventas_listaprecioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_ventas_usuarioid"`);
    await q.query(`DROP INDEX IF EXISTS "ix_endpoints_metodo_ruta"`);
    await q.query(`DROP INDEX IF EXISTS "ix_permisos_empresa_endpoint"`);
    await q.query(`DROP INDEX IF EXISTS "ix_permisos_empresa_rol_endpoint"`);
    await q.query(`DROP INDEX IF EXISTS "ix_permisos_empresa_rol"`);
  }
}
