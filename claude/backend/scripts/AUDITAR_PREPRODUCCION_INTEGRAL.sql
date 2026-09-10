/*
  SyncroERP · Auditoría integral de preproducción
  Fecha: 2026-08-01
  Sólo lectura. Ejecútela después de migrar una copia de la base y cargar datos de prueba.
*/
SET NOCOUNT ON;

SELECT DB_NAME() BaseDatos, @@SERVERNAME Servidor, SYSUTCDATETIME() EjecutadoUtc,
       CAST(SERVERPROPERTY('ProductVersion') AS varchar(50)) VersionSqlServer;

/* Migraciones/objetos obligatorios del release candidate */
DECLARE @Objetos table(Modulo varchar(60), Objeto sysname, Tipo char(2));
INSERT @Objetos VALUES
('Finanzas','dbo.asientos_pendientes','U'),
('Finanzas','dbo.polizas','U'),
('Finanzas','dbo.partidas_poliza','U'),
('Ventas','dbo.ventas','U'),
('Inventario/WMS','dbo.reservas_inventario','U'),
('Inventario/WMS','dbo.stock_por_almacen','U'),
('Compras','dbo.pagos_proveedor','U'),
('Crédito y cobranza','dbo.pagos_cobranza','U'),
('CFDI','dbo.facturas','U'),
('Hotelería','dbo.folios','U'),
('Hotelería','dbo.pagos_folio_hotel','U'),
('RRHH/Nómina','dbo.rrhh_periodos_nomina','U'),
('RRHH/Nómina','dbo.rrhh_cuentas_bancarias_empleado','U'),
('Importaciones','dbo.importaciones_inventario_filas_aplicadas','U');
SELECT Modulo,Objeto,CASE WHEN OBJECT_ID(Objeto,Tipo) IS NULL THEN 'FALTA' ELSE 'OK' END Estado
FROM @Objetos ORDER BY Modulo,Objeto;

/* Estado del outbox contable */
IF OBJECT_ID('dbo.asientos_pendientes','U') IS NOT NULL
  SELECT empresaId,tipo,estado,COUNT_BIG(1) cantidad,MIN(fechaCreacion) masAntiguo
  FROM dbo.asientos_pendientes GROUP BY empresaId,tipo,estado ORDER BY empresaId,tipo,estado;

/* Pólizas descuadradas */
IF OBJECT_ID('dbo.polizas','U') IS NOT NULL AND OBJECT_ID('dbo.partidas_poliza','U') IS NOT NULL
  SELECT p.empresaId,p.id,p.folio,p.fecha,
         SUM(COALESCE(d.debe,0)) debe,SUM(COALESCE(d.haber,0)) haber,
         SUM(COALESCE(d.debe,0))-SUM(COALESCE(d.haber,0)) diferencia
    FROM dbo.polizas p LEFT JOIN dbo.partidas_poliza d ON d.polizaId=p.id
   GROUP BY p.empresaId,p.id,p.folio,p.fecha
  HAVING ABS(SUM(COALESCE(d.debe,0))-SUM(COALESCE(d.haber,0)))>0.01
   ORDER BY p.fecha,p.folio;

/* WMS */
IF OBJECT_ID('dbo.stock_por_almacen','U') IS NOT NULL
  SELECT TOP(500) * FROM dbo.stock_por_almacen
   WHERE cantidad<0 OR reservado<0 OR bloqueado<0 OR comprometido<>0
      OR reservado+bloqueado>cantidad+0.0001
   ORDER BY empresaId,almacenId,productoId;

IF OBJECT_ID('dbo.reservas_inventario','U') IS NOT NULL
  SELECT TOP(500) * FROM dbo.reservas_inventario
   WHERE estado IN ('ACTIVA','PARCIALMENTE_CONSUMIDA')
     AND expiraEn IS NOT NULL AND expiraEn<SYSUTCDATETIME()
   ORDER BY expiraEn;

/* Ventas sin póliza o con evento pendiente */
IF OBJECT_ID('dbo.ventas','U') IS NOT NULL
BEGIN
  DECLARE @sqlVentas nvarchar(max)=N'SELECT TOP(500) id,empresaId,folio,fecha,total';
  IF COL_LENGTH('dbo.ventas','polizaId') IS NOT NULL SET @sqlVentas += N',polizaId';
  IF COL_LENGTH('dbo.ventas','estadoContable') IS NOT NULL SET @sqlVentas += N',estadoContable';
  SET @sqlVentas += N' FROM dbo.ventas ORDER BY fecha DESC';
  EXEC sys.sp_executesql @sqlVentas;
END

/* Hotel */
IF OBJECT_ID('dbo.folios','U') IS NOT NULL AND COL_LENGTH('dbo.folios','saldoPendiente') IS NOT NULL
  SELECT TOP(500) id,empresaId,estado,total,totalAplicado,totalCobrado,saldoPendiente,estadoContable,polizaId,asientoPendienteId
    FROM dbo.folios
   WHERE saldoPendiente<0 OR ABS(total-(totalAplicado+saldoPendiente))>0.02
      OR (estado IN ('CERRADO','PENDIENTE_PAGO') AND estadoContable NOT IN ('GENERADO','REVERTIDO'))
   ORDER BY fechaActualizacion DESC;

/* Cobranza/proveedores */
IF OBJECT_ID('dbo.pagos_cobranza','U') IS NOT NULL AND COL_LENGTH('dbo.pagos_cobranza','estadoContable') IS NOT NULL
  SELECT TOP(500) * FROM dbo.pagos_cobranza WHERE estadoContable NOT IN ('GENERADO','REVERTIDO') ORDER BY fechaPago;
IF OBJECT_ID('dbo.pagos_proveedor','U') IS NOT NULL AND COL_LENGTH('dbo.pagos_proveedor','estadoContable') IS NOT NULL
  SELECT TOP(500) * FROM dbo.pagos_proveedor WHERE estadoContable NOT IN ('GENERADO','REVERTIDO') ORDER BY fechaPago;

/* CFDI */
IF OBJECT_ID('dbo.facturas','U') IS NOT NULL
  SELECT empresaId,estado,COUNT_BIG(1) cantidad,MIN(fechaCreacion) masAntiguo
    FROM dbo.facturas GROUP BY empresaId,estado ORDER BY empresaId,estado;

/* Nómina */
IF OBJECT_ID('dbo.rrhh_periodos_nomina','U') IS NOT NULL
  SELECT TOP(500) id,empresaId,ejercicio,numero,regimen,estado,totalPercepciones,totalDeducciones,totalNeto,
         polizaId,versionCalculo,hashCalculo,bloqueado,fechaActualizacion
    FROM dbo.rrhh_periodos_nomina
   WHERE (estado IN ('PAGADO','CONTABILIZADO','CERRADO') AND polizaId IS NULL)
      OR (estado<>'ABIERTO' AND (hashCalculo IS NULL OR versionCalculo<=0))
   ORDER BY ejercicio DESC,numero DESC;

/* Importación masiva */
IF OBJECT_ID('dbo.importaciones_inventario','U') IS NOT NULL
  SELECT TOP(500) id,empresa_id,estado,total_filas,filas_procesadas,filas_correctas,filas_con_error,porcentaje,
         estado_contable,poliza_id,asiento_pendiente_id,fecha_actualizacion
    FROM dbo.importaciones_inventario
   WHERE (estado IN ('COMPLETADO','COMPLETADO_CON_ERRORES') AND COALESCE(estado_contable,'PENDIENTE') NOT IN ('GENERADO','REVERTIDO'))
      OR filas_procesadas>total_filas OR filas_correctas+filas_con_error>filas_procesadas
   ORDER BY fecha_actualizacion DESC;

PRINT 'Auditoría terminada. Todo resultado con filas requiere revisión antes de salida a producción.';
