/*
  SyncroERP · Validación previa a migraciones consolidadas
  Fecha: 2026-08-01
  Sólo lectura. No corrige ni elimina información.
  Ejecútelo sobre una copia reciente de la base antes de migration:run.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('tempdb..#Resultados') IS NOT NULL DROP TABLE #Resultados;
CREATE TABLE #Resultados(
  Nivel varchar(12) NOT NULL,
  Modulo varchar(60) NOT NULL,
  Codigo varchar(100) NOT NULL,
  Cantidad bigint NOT NULL,
  Detalle nvarchar(1000) NOT NULL
);

DECLARE @sql nvarchar(max);

/* ───────────────────── Contabilidad / outbox ───────────────────── */
IF OBJECT_ID('dbo.asientos_pendientes','U') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
           ''Finanzas'', ''ASIENTOS_PENDIENTES_O_FALLIDOS'', COUNT_BIG(1),
           ''Operaciones económicas sin póliza definitiva.''
      FROM dbo.asientos_pendientes
     WHERE estado IN (''PENDIENTE'',''REINTENTANDO'',''FALLIDO'')';
  EXEC sys.sp_executesql @sql;

  IF COL_LENGTH('dbo.asientos_pendientes','documentoId') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Finanzas'', ''OUTBOX_DUPLICADO_DOCUMENTO'', COUNT_BIG(1),
             ''Más de un evento contable para el mismo tipo/documento/empresa.''
        FROM (SELECT empresaId,tipo,documentoId
                FROM dbo.asientos_pendientes
               WHERE documentoId IS NOT NULL
               GROUP BY empresaId,tipo,documentoId HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
END
ELSE
  INSERT #Resultados VALUES('INFO','Finanzas','TABLA_OUTBOX_NO_EXISTE',0,'La tabla se creará mediante migraciones anteriores.');

/* ───────────────────── WMS / inventario ───────────────────── */
IF OBJECT_ID('dbo.stock_por_almacen','U') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
           ''Inventario/WMS'', ''STOCK_RESERVAS_INCONSISTENTES'', COUNT_BIG(1),
           ''Existencia, reservado, bloqueado o comprometido presentan descuadre.''
      FROM dbo.stock_por_almacen
     WHERE cantidad<0 OR reservado<0 OR bloqueado<0 OR comprometido<>0
        OR reservado+bloqueado>cantidad+0.0001';
  EXEC sys.sp_executesql @sql;
END

IF OBJECT_ID('dbo.reservas_inventario','U') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''ALTO'' ELSE ''OK'' END,
           ''Inventario/WMS'', ''RESERVAS_VENCIDAS_ACTIVAS'', COUNT_BIG(1),
           ''Reservas vencidas que continúan reduciendo disponibilidad.''
      FROM dbo.reservas_inventario
     WHERE estado IN (''ACTIVA'',''PARCIALMENTE_CONSUMIDA'')
       AND expiraEn IS NOT NULL AND expiraEn<SYSUTCDATETIME()';
  EXEC sys.sp_executesql @sql;

  IF COL_LENGTH('dbo.reservas_inventario','cantidadConsumida') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Inventario/WMS'', ''RESERVA_CONSUMO_INVALIDO'', COUNT_BIG(1),
             ''Cantidad consumida negativa o superior a la reservada.''
        FROM dbo.reservas_inventario
       WHERE cantidadConsumida<0 OR cantidadConsumida>cantidad+0.0001';
    EXEC sys.sp_executesql @sql;
  END
END

/* ───────────────────── Ventas ───────────────────── */
IF OBJECT_ID('dbo.ventas','U') IS NOT NULL AND COL_LENGTH('dbo.ventas','claveIdempotencia') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
           ''Ventas'', ''VENTAS_IDEMPOTENCIA_DUPLICADA'', COUNT_BIG(1),
           ''Claves de idempotencia repetidas dentro de la misma empresa.''
      FROM (SELECT empresaId,claveIdempotencia
              FROM dbo.ventas WHERE claveIdempotencia IS NOT NULL
             GROUP BY empresaId,claveIdempotencia HAVING COUNT_BIG(1)>1) d';
  EXEC sys.sp_executesql @sql;
END

/* ───────────────────── Hotelería ───────────────────── */
IF OBJECT_ID('dbo.hoteles','U') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''ALTO'' ELSE ''OK'' END,
           ''Hotelería'', ''HOTEL_NOMBRE_DUPLICADO'', COUNT_BIG(1),
           ''Hoteles activos con el mismo nombre dentro de la empresa.''
      FROM (SELECT empresaId,UPPER(LTRIM(RTRIM(nombre))) nombre
              FROM dbo.hoteles GROUP BY empresaId,UPPER(LTRIM(RTRIM(nombre))) HAVING COUNT_BIG(1)>1) d';
  EXEC sys.sp_executesql @sql;
END

IF OBJECT_ID('dbo.folios','U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.folios','estadoContable') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Hotelería'', ''FOLIOS_CERRADOS_SIN_CONTABILIZAR'', COUNT_BIG(1),
             ''Folios cerrados o pendientes de pago sin póliza definitiva.''
        FROM dbo.folios
       WHERE estado IN (''CERRADO'',''PENDIENTE_PAGO'')
         AND estadoContable NOT IN (''GENERADO'',''REVERTIDO'')';
    EXEC sys.sp_executesql @sql;
  END

  IF COL_LENGTH('dbo.folios','saldoPendiente') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Hotelería'', ''FOLIOS_DESCUADRADOS'', COUNT_BIG(1),
             ''Total, aplicaciones y saldo no coinciden.''
        FROM dbo.folios
       WHERE saldoPendiente<0 OR totalAplicado<0 OR totalCobrado<0
          OR ABS(total-(totalAplicado+saldoPendiente))>0.02';
    EXEC sys.sp_executesql @sql;
  END

  IF COL_LENGTH('dbo.folios','reservacionId') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Hotelería'', ''FOLIO_DUPLICADO_RESERVACION'', COUNT_BIG(1),
             ''Una reservación tiene más de un folio en la misma empresa.''
        FROM (SELECT empresaId,reservacionId FROM dbo.folios
               WHERE reservacionId IS NOT NULL
               GROUP BY empresaId,reservacionId HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
END

/* ───────────────────── CFDI ───────────────────── */
IF OBJECT_ID('dbo.facturas','U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.facturas','serie') IS NOT NULL AND COL_LENGTH('dbo.facturas','folio') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''CFDI'', ''CFDI_SERIE_FOLIO_DUPLICADO'', COUNT_BIG(1),
             ''Serie y folio repetidos dentro de la misma empresa.''
        FROM (SELECT empresaId,serie,folio FROM dbo.facturas
               GROUP BY empresaId,serie,folio HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
  IF COL_LENGTH('dbo.facturas','uuid') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''CFDI'', ''UUID_FISCAL_DUPLICADO'', COUNT_BIG(1),
             ''UUID fiscal repetido dentro de la empresa.''
        FROM (SELECT empresaId,uuid FROM dbo.facturas WHERE uuid IS NOT NULL
               GROUP BY empresaId,uuid HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
  IF COL_LENGTH('dbo.facturas','claveIdempotencia') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''CFDI'', ''CFDI_IDEMPOTENCIA_DUPLICADA'', COUNT_BIG(1),
             ''Solicitud fiscal repetida para la misma empresa.''
        FROM (SELECT empresaId,claveIdempotencia FROM dbo.facturas WHERE claveIdempotencia IS NOT NULL
               GROUP BY empresaId,claveIdempotencia HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
END

/* ───────────────────── Crédito/cobranza ───────────────────── */
IF OBJECT_ID('dbo.pagos_cobranza','U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.pagos_cobranza','claveIdempotencia') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Crédito y cobranza'', ''COBRO_IDEMPOTENCIA_DUPLICADA'', COUNT_BIG(1),
             ''Cobros duplicados por clave de idempotencia.''
        FROM (SELECT empresaId,claveIdempotencia FROM dbo.pagos_cobranza
               WHERE claveIdempotencia IS NOT NULL
               GROUP BY empresaId,claveIdempotencia HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
  IF COL_LENGTH('dbo.pagos_cobranza','estadoContable') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Crédito y cobranza'', ''COBROS_SIN_CONTABILIZAR'', COUNT_BIG(1),
             ''Cobros aplicados a cartera sin póliza definitiva.''
        FROM dbo.pagos_cobranza
       WHERE estadoContable NOT IN (''GENERADO'',''REVERTIDO'')';
    EXEC sys.sp_executesql @sql;
  END
END

/* ───────────────────── Compras/proveedores ───────────────────── */
IF OBJECT_ID('dbo.pagos_proveedor','U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.pagos_proveedor','claveIdempotencia') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Compras'', ''PAGO_PROVEEDOR_IDEMPOTENCIA_DUPLICADA'', COUNT_BIG(1),
             ''Pagos al proveedor duplicados por clave de idempotencia.''
        FROM (SELECT empresaId,claveIdempotencia FROM dbo.pagos_proveedor
               WHERE claveIdempotencia IS NOT NULL
               GROUP BY empresaId,claveIdempotencia HAVING COUNT_BIG(1)>1) d';
    EXEC sys.sp_executesql @sql;
  END
  IF COL_LENGTH('dbo.pagos_proveedor','estadoContable') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''Compras'', ''PAGOS_PROVEEDOR_SIN_CONTABILIZAR'', COUNT_BIG(1),
             ''Pagos registrados y no contabilizados.''
        FROM dbo.pagos_proveedor
       WHERE estadoContable NOT IN (''GENERADO'',''REVERTIDO'')';
    EXEC sys.sp_executesql @sql;
  END
END

/* ───────────────────── Nómina ───────────────────── */
IF OBJECT_ID('dbo.rrhh_periodos_nomina','U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.rrhh_periodos_nomina','polizaId') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
             ''RRHH/Nómina'', ''NOMINA_FINAL_SIN_POLIZA'', COUNT_BIG(1),
             ''Periodos pagados, contabilizados o cerrados sin póliza.''
        FROM dbo.rrhh_periodos_nomina
       WHERE estado IN (''PAGADO'',''CONTABILIZADO'',''CERRADO'') AND polizaId IS NULL';
    EXEC sys.sp_executesql @sql;
  END
  IF COL_LENGTH('dbo.rrhh_periodos_nomina','hashCalculo') IS NOT NULL
  BEGIN
    SET @sql = N'INSERT #Resultados
      SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''ALTO'' ELSE ''OK'' END,
             ''RRHH/Nómina'', ''NOMINA_SIN_SNAPSHOT'', COUNT_BIG(1),
             ''Periodo calculado o posterior sin huella de cálculo.''
        FROM dbo.rrhh_periodos_nomina
       WHERE estado<>''ABIERTO'' AND (hashCalculo IS NULL OR versionCalculo<=0)';
    EXEC sys.sp_executesql @sql;
  END
END

IF OBJECT_ID('dbo.rrhh_cuentas_bancarias_empleado','U') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
           ''RRHH/Nómina'', ''CUENTAS_PRINCIPALES_DUPLICADAS'', COUNT_BIG(1),
           ''Empleado con más de una cuenta principal activa.''
      FROM (SELECT empresaId,empleadoId FROM dbo.rrhh_cuentas_bancarias_empleado
             WHERE principal=1 AND estado=''ACTIVA''
             GROUP BY empresaId,empleadoId HAVING COUNT_BIG(1)>1) d';
  EXEC sys.sp_executesql @sql;
END

/* ───────────────────── Importación de inventario ───────────────────── */
IF OBJECT_ID('dbo.importaciones_inventario_filas_aplicadas','U') IS NOT NULL
BEGIN
  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
           ''Importaciones'', ''FILA_IMPORTADA_DUPLICADA'', COUNT_BIG(1),
           ''La misma fila de un trabajo fue aplicada más de una vez.''
      FROM (SELECT importacionId,numeroFila FROM dbo.importaciones_inventario_filas_aplicadas
             GROUP BY importacionId,numeroFila HAVING COUNT_BIG(1)>1) d';
  EXEC sys.sp_executesql @sql;

  SET @sql = N'INSERT #Resultados
    SELECT CASE WHEN COUNT_BIG(1)>0 THEN ''CRITICO'' ELSE ''OK'' END,
           ''Importaciones'', ''FILA_IMPORTADA_SIN_TRABAJO'', COUNT_BIG(1),
           ''Marcadores de fila sin trabajo de importación padre.''
      FROM dbo.importaciones_inventario_filas_aplicadas f
      LEFT JOIN dbo.importaciones_inventario i ON i.id=f.importacionId
     WHERE i.id IS NULL';
  EXEC sys.sp_executesql @sql;
END

/* Resultado */
SELECT Nivel, Modulo, Codigo, Cantidad, Detalle
  FROM #Resultados
 ORDER BY CASE Nivel WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2 WHEN 'MEDIO' THEN 3 WHEN 'INFO' THEN 4 ELSE 5 END,
          Modulo, Codigo;

DECLARE @criticos bigint = (SELECT COALESCE(SUM(Cantidad),0) FROM #Resultados WHERE Nivel='CRITICO');
DECLARE @altos bigint = (SELECT COALESCE(SUM(Cantidad),0) FROM #Resultados WHERE Nivel='ALTO');
SELECT @criticos AS HallazgosCriticos, @altos AS HallazgosAltos,
       CASE WHEN @criticos>0 THEN 'BLOQUEAR_MIGRACION'
            WHEN @altos>0 THEN 'REVISAR_ANTES_DE_MIGRAR'
            ELSE 'SIN_HALLAZGOS_DE_DATOS_EN_ESTA_VALIDACION' END AS Dictamen;

IF @criticos>0
  THROW 51001, 'Se detectaron inconsistencias críticas. No ejecute las migraciones hasta corregirlas.', 1;
