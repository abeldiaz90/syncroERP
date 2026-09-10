/*
  SyncroERP v14.2 · Validación de coherencia Crédito / Hotelería / Aprobaciones
  Sólo lectura. No modifica datos.

  Resultado esperado: cero filas con severidad CRITICA o ALTA.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('tempdb..#Hallazgos') IS NOT NULL DROP TABLE #Hallazgos;
CREATE TABLE #Hallazgos (
  severidad varchar(10) NOT NULL,
  codigo varchar(50) NOT NULL,
  cantidad bigint NOT NULL,
  detalle nvarchar(500) NOT NULL
);

DECLARE @estructuraValida bit = 1;

IF OBJECT_ID('dbo.clientes','U') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','ESTRUCTURA_CLIENTES',1,N'No existe dbo.clientes.');
  SET @estructuraValida = 0;
END;
IF OBJECT_ID('dbo.hoteleria_convenios_credito','U') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','ESTRUCTURA_CONVENIOS',1,N'No existe dbo.hoteleria_convenios_credito.');
  SET @estructuraValida = 0;
END;
IF OBJECT_ID('dbo.hoteles','U') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','ESTRUCTURA_HOTELES',1,N'No existe dbo.hoteles.');
  SET @estructuraValida = 0;
END;
IF OBJECT_ID('dbo.aprobaciones_documentos','U') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','ESTRUCTURA_APROBACIONES',1,N'No existe dbo.aprobaciones_documentos.');
  SET @estructuraValida = 0;
END;
IF OBJECT_ID('dbo.configuraciones_aprobacion','U') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','ESTRUCTURA_MATRIZ',1,N'No existe dbo.configuraciones_aprobacion.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.aprobaciones_documentos','ciclo') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_CICLO',1,N'Falta aprobaciones_documentos.ciclo. Ejecuta la migración v14.2.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.aprobaciones_documentos','importeSolicitado') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_IMPORTE',1,N'Falta aprobaciones_documentos.importeSolicitado. Ejecuta la migración v14.2.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.aprobaciones_documentos','fechaVencimiento') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('ALTA','COLUMNA_SLA_APROBACION',1,N'Falta aprobaciones_documentos.fechaVencimiento.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.hoteleria_convenios_credito','suspendidoPorId') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('ALTA','COLUMNA_SUSPENSION',1,N'Falta trazabilidad de suspensión del convenio. Ejecuta la migración v14.2.');
  SET @estructuraValida = 0;
END;

IF COL_LENGTH('dbo.clientes','versionCredito') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_VERSION_CREDITO',1,N'Falta clientes.versionCredito.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.clientes','clasificacionHotelera') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_CLASIFICACION_HOTEL',1,N'Falta la clasificación hotelera maestra del cliente.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.clientes','bloquearCreditoConSaldoVencido') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_POLITICA_VENCIDOS',1,N'Falta la política maestra de bloqueo por saldos vencidos.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.clientes','estadoSolicitudCredito') IS NULL
   OR COL_LENGTH('dbo.clientes','limiteCreditoSolicitado') IS NULL
   OR COL_LENGTH('dbo.clientes','diasCreditoSolicitados') IS NULL
   OR COL_LENGTH('dbo.clientes','versionSolicitudCredito') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNAS_MAKER_CHECKER_CREDITO',1,N'Faltan columnas para separar la línea vigente de la propuesta de crédito. Ejecuta la migración v14.7.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.aprobaciones_documentos','documentoVersion') IS NULL OR COL_LENGTH('dbo.aprobaciones_documentos','datosSolicitud') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_SNAPSHOT_APROBACION',1,N'Faltan versión o snapshot de las condiciones sometidas a aprobación.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.hoteleria_convenios_credito','versionCreditoCliente') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNA_VERSION_CONVENIO',1,N'Falta la versión de la línea maestra utilizada por el convenio.');
  SET @estructuraValida = 0;
END;

IF OBJECT_ID('dbo.hoteleria_city_ledger_cuentas','U') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','ESTRUCTURA_CITY_LEDGER',1,N'No existe dbo.hoteleria_city_ledger_cuentas.');
  SET @estructuraValida = 0;
END;
ELSE IF COL_LENGTH('dbo.hoteleria_city_ledger_cuentas','convenioVersion') IS NULL
   OR COL_LENGTH('dbo.hoteleria_city_ledger_cuentas','numeroConvenioSnapshot') IS NULL
   OR COL_LENGTH('dbo.hoteleria_city_ledger_cuentas','diasCreditoAplicados') IS NULL
   OR COL_LENGTH('dbo.hoteleria_city_ledger_cuentas','versionCreditoClienteAplicada') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('ALTA','SNAPSHOT_CUENTA_CITY_LEDGER',1,N'Faltan snapshots del convenio y de la línea aplicados a cada cuenta. Ejecuta la migración v14.8.');
  SET @estructuraValida = 0;
END;

IF COL_LENGTH('dbo.hoteleria_convenios_credito','vigenciaDesde') IS NULL
   OR COL_LENGTH('dbo.hoteleria_convenios_credito','vigenciaHasta') IS NULL
   OR COL_LENGTH('dbo.hoteleria_convenios_credito','tolerancia') IS NULL
   OR COL_LENGTH('dbo.hoteleria_convenios_credito','activo') IS NULL
   OR COL_LENGTH('dbo.hoteleria_convenios_credito','estado') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('CRITICA','COLUMNAS_CICLO_CONVENIO',1,N'Faltan columnas requeridas para vigencia, estado o política de crédito del convenio.');
  SET @estructuraValida = 0;
END;
IF COL_LENGTH('dbo.hoteleria_convenios_credito','canceladoPorId') IS NULL
   OR COL_LENGTH('dbo.hoteleria_convenios_credito','fechaCancelacion') IS NULL
BEGIN
  INSERT #Hallazgos VALUES ('ALTA','COLUMNAS_CANCELACION_CONVENIO',1,N'Falta trazabilidad de cancelación del convenio. Ejecuta las migraciones v14.2-v14.5.');
  SET @estructuraValida = 0;
END;

IF @estructuraValida = 1
BEGIN
  DECLARE @cantidad bigint;

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.clientes
   WHERE clasificacionHotelera IS NOT NULL
     AND (tipoPersona<>'MORAL' OR clasificacionHotelera NOT IN ('EMPRESA','AGENCIA'));
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CLASIFICACION_HOTEL_INVALIDA',@cantidad,
    N'Hay clasificaciones EMPRESA/AGENCIA asignadas a clientes que no son personas morales.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.configuraciones_aprobacion
   WHERE activo=1 AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     AND (departamentoId IS NOT NULL OR obligatorio=0 OR permiteAutoaprobacion=1 OR
          (usuarioId IS NULL AND rolAprobador IS NULL) OR
          (usuarioId IS NOT NULL AND rolAprobador IS NOT NULL));
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','MATRIZ_FINANCIERA_INVALIDA',@cantidad,
    N'Los flujos financieros deben ser globales, obligatorios, sin autoaprobación y con exactamente un responsable por nivel.'
  );

  SELECT @cantidad=COUNT_BIG(*) FROM (
    SELECT empresaId,proceso,orden
      FROM dbo.configuraciones_aprobacion
     WHERE activo=1 AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     GROUP BY empresaId,proceso,orden
    HAVING COUNT_BIG(*)>1
  ) d;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','NIVEL_FINANCIERO_DUPLICADO',@cantidad,
    N'Existen niveles activos duplicados dentro de una matriz financiera.'
  );

  ;WITH niveles AS (
    SELECT empresaId,proceso,orden,montoDesde,montoHasta,
           ROW_NUMBER() OVER(PARTITION BY empresaId,proceso ORDER BY orden) fila,
           COUNT_BIG(*) OVER(PARTITION BY empresaId,proceso) total,
           LAG(montoHasta) OVER(PARTITION BY empresaId,proceso ORDER BY orden) topeAnterior
      FROM dbo.configuraciones_aprobacion
     WHERE activo=1 AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
  )
  SELECT @cantidad=COUNT_BIG(*)
    FROM niveles
   WHERE orden<>fila
      OR (fila<total AND montoHasta IS NULL)
      OR (fila=total AND montoHasta IS NOT NULL)
      OR ABS(ISNULL(montoDesde,0)-CASE WHEN fila=1 THEN 0 ELSE ISNULL(topeAnterior,0)+0.01 END)>0.009;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','ESCALA_AUTORIDAD_INCOHERENTE',@cantidad,
    N'Los niveles no son consecutivos, tienen huecos/traslapes o el último nivel conserva un tope.'
  );

  SELECT @cantidad=COUNT_BIG(*)
  FROM (VALUES('CREDITO_CLIENTE'),('HOTEL_CONVENIO')) p(proceso)
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.configuraciones_aprobacion c
     WHERE c.activo=1 AND c.proceso=p.proceso
  );
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','FLUJO_FINANCIERO_NO_CONFIGURADO',@cantidad,
    N'Falta configurar Crédito de cliente o Convenio hotelero en Gobierno de aprobaciones.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito
   WHERE vigenciaHasta IS NOT NULL AND vigenciaHasta<vigenciaDesde;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','VIGENCIA_CONVENIO_INVALIDA',@cantidad,
    N'Hay convenios cuya fecha final es anterior a la inicial.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito
   WHERE ABS(COALESCE(tolerancia,0))>0.009;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','TOLERANCIA_DUPLICA_CREDITO',@cantidad,
    N'Hay convenios con tolerancia distinta de cero. El convenio no puede ampliar la línea maestra del cliente.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito
   WHERE estado='APROBADO'
     AND vigenciaHasta IS NOT NULL
     AND vigenciaHasta<CONVERT(date,SYSUTCDATETIME());
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','CONVENIO_APROBADO_VENCIDO',@cantidad,
    N'Hay convenios aprobados cuya vigencia terminó y deben pasar a VENCIDO.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito
   WHERE (estado='CANCELADO' AND activo<>0)
      OR (estado IN ('PENDIENTE','APROBADO','SUSPENDIDO','VENCIDO') AND activo=0);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','ESTADO_ACTIVO_CONVENIO_INCOHERENTE',@cantidad,
    N'El indicador activo no coincide con el estado del convenio.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito h
    LEFT JOIN dbo.hoteles hotel ON hotel.id=h.hotelId AND hotel.empresaId=h.empresaId
   WHERE h.estado IN ('PENDIENTE','APROBADO')
     AND (hotel.id IS NULL OR hotel.activo=0);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CONVENIO_HOTEL_INACTIVO',@cantidad,
    N'Hay convenios pendientes o aprobados asociados a un hotel inactivo o inexistente.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito h
   WHERE h.estado='CANCELADO'
     AND EXISTS (
       SELECT 1 FROM dbo.aprobaciones_documentos a
        WHERE a.empresaId=h.empresaId AND a.proceso='HOTEL_CONVENIO'
          AND a.documentoId=h.id AND a.estado='PENDIENTE'
     );
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CONVENIO_CANCELADO_CON_APROBACION',@cantidad,
    N'Hay convenios cancelados con niveles de aprobación todavía pendientes.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM sys.check_constraints
   WHERE parent_object_id=OBJECT_ID('dbo.hoteleria_convenios_credito')
     AND name IN ('CK_hotel_convenio_vigencia_v145','CK_hotel_convenio_tolerancia_v145')
     AND (is_disabled=1 OR is_not_trusted=1);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','REGLAS_CONVENIO_NO_CONFIABLES',@cantidad,
    N'Las restricciones de vigencia o tolerancia están deshabilitadas o no son confiables.'
  );

  SELECT @cantidad=2-COUNT_BIG(*)
    FROM sys.check_constraints
   WHERE parent_object_id=OBJECT_ID('dbo.hoteleria_convenios_credito')
     AND name IN ('CK_hotel_convenio_vigencia_v145','CK_hotel_convenio_tolerancia_v145');
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','REGLAS_CONVENIO_FALTANTES',@cantidad,
    N'Faltan restricciones de base de datos para vigencia y tolerancia del convenio.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.clientes
   WHERE estadoCredito='AUTORIZADO'
     AND (activo=0 OR ISNULL(limiteCredito,0)<=0 OR ISNULL(diasCredito,0)<=0);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CLIENTE_AUTORIZADO_INVALIDO',@cantidad,
    N'Clientes autorizados inactivos o sin límite/plazo válidos.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito h
    LEFT JOIN dbo.clientes c ON c.id=h.clienteId AND c.empresaId=h.empresaId
   WHERE h.estado='APROBADO'
     AND (h.activo=0 OR c.id IS NULL OR c.activo=0 OR c.estadoCredito<>'AUTORIZADO');
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CONVENIO_SIN_LINEA_MAESTRA',@cantidad,
    N'Convenios aprobados cuyo cliente no tiene una línea maestra activa y autorizada.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito h
    INNER JOIN dbo.clientes c ON c.id=h.clienteId AND c.empresaId=h.empresaId
   WHERE h.estado IN ('PENDIENTE','APROBADO')
     AND (ABS(ISNULL(h.limiteCredito,0)-ISNULL(c.limiteCredito,0))>0.009
       OR ISNULL(h.diasCredito,0)<>ISNULL(c.diasCredito,0));
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','SNAPSHOT_CONVENIO_DESACTUALIZADO',@cantidad,
    N'El snapshot del convenio difiere de la línea maestra. Reenvía o suspende el convenio.'
  );


  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito h
    INNER JOIN dbo.clientes c ON c.id=h.clienteId AND c.empresaId=h.empresaId
   WHERE h.estado IN ('PENDIENTE','APROBADO')
     AND ((h.estado='PENDIENTE' AND c.estadoSolicitudCredito='PENDIENTE')
       OR ISNULL(h.versionCreditoCliente,0)<>ISNULL(c.versionCredito,0)
       OR h.tipo<>c.clasificacionHotelera
       OR h.bloquearConSaldoVencido<>c.bloquearCreditoConSaldoVencido);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CONVENIO_NO_HEREDA_MAESTRO',@cantidad,
    N'Convenios vigentes no coinciden con versión, clasificación o política de vencidos del cliente.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.clientes c
   WHERE c.estadoSolicitudCredito='PENDIENTE'
     AND NOT EXISTS (
       SELECT 1 FROM dbo.aprobaciones_documentos a
        WHERE a.empresaId=c.empresaId AND a.proceso='CREDITO_CLIENTE'
          AND a.documentoId=c.id AND a.estado='PENDIENTE'
          AND a.documentoVersion=c.versionSolicitudCredito
     );
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CREDITO_SIN_APROBACION',@cantidad,
    N'Propuestas de crédito PENDIENTE sin nivel correspondiente en la bandeja central.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.clientes c
   WHERE c.estadoSolicitudCredito='PENDIENTE'
     AND (c.activo=0 OR ISNULL(c.limiteCreditoSolicitado,0)<=0
       OR ISNULL(c.diasCreditoSolicitados,0)<=0
       OR ISNULL(c.versionSolicitudCredito,0)<=0);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','PROPUESTA_CREDITO_INVALIDA',@cantidad,
    N'Hay propuestas pendientes sin cliente activo, límite, plazo o versión válida.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.aprobaciones_documentos a
    INNER JOIN dbo.clientes c
      ON c.id=a.documentoId AND c.empresaId=a.empresaId
   WHERE a.proceso='CREDITO_CLIENTE' AND a.estado='PENDIENTE'
     AND (c.estadoSolicitudCredito<>'PENDIENTE'
       OR a.documentoVersion<>c.versionSolicitudCredito
       OR ABS(ISNULL(a.importeSolicitado,0)-ISNULL(c.limiteCreditoSolicitado,0))>0.009);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','APROBACION_CREDITO_DESFASADA',@cantidad,
    N'Hay niveles de aprobación que no corresponden a la propuesta maker-checker vigente.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.hoteleria_convenios_credito h
   WHERE h.estado='PENDIENTE'
     AND NOT EXISTS (
       SELECT 1 FROM dbo.aprobaciones_documentos a
        WHERE a.empresaId=h.empresaId AND a.proceso='HOTEL_CONVENIO'
          AND a.documentoId=h.id AND a.estado='PENDIENTE'
     );
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CONVENIO_SIN_APROBACION',@cantidad,
    N'Convenios PENDIENTE sin nivel pendiente en la bandeja central.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.aprobaciones_documentos
   WHERE proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     AND estado='PENDIENTE'
     AND (documentoVersion<1 OR datosSolicitud IS NULL OR ISJSON(datosSolicitud)<>1);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','APROBACION_SIN_SNAPSHOT_VALIDO',@cantidad,
    N'Hay niveles pendientes sin versión o snapshot JSON válido.'
  );

  ;WITH pendientes AS (
    SELECT id,fechaVencimiento,
           ROW_NUMBER() OVER(
             PARTITION BY empresaId,proceso,documentoId,ciclo
             ORDER BY nivel
           ) posicion
      FROM dbo.aprobaciones_documentos
     WHERE proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
       AND estado='PENDIENTE'
  )
  SELECT @cantidad=COUNT_BIG(*)
    FROM pendientes
   WHERE (posicion=1 AND fechaVencimiento IS NULL)
      OR (posicion>1 AND fechaVencimiento IS NOT NULL);
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','SLA_NO_SECUENCIAL',@cantidad,
    N'El SLA debe correr únicamente para el siguiente nivel atendible; los niveles posteriores deben permanecer sin fecha.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.aprobaciones_documentos
   WHERE proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     AND estado='PENDIENTE'
     AND usuarioAprobadorId IS NULL;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','NIVEL_FINANCIERO_SIN_PERSONA_ASIGNADA',@cantidad,
    N'Los ciclos nuevos deben materializar una persona distinta por nivel para evitar rutas que queden sin salida.'
  );

  SELECT @cantidad=COUNT_BIG(*)
    FROM dbo.aprobaciones_documentos
   WHERE proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     AND estado='PENDIENTE'
     AND usuarioAprobadorId IS NOT NULL
     AND usuarioAprobadorId=solicitadoPorId;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','SOLICITANTE_ASIGNADO_COMO_APROBADOR',@cantidad,
    N'El solicitante está asignado explícitamente como aprobador de su propio ciclo.'
  );

  SELECT @cantidad = COUNT_BIG(*)
    FROM dbo.aprobaciones_documentos a
    LEFT JOIN dbo.clientes c
      ON a.proceso='CREDITO_CLIENTE' AND c.id=a.documentoId AND c.empresaId=a.empresaId
    LEFT JOIN dbo.hoteleria_convenios_credito h
      ON a.proceso='HOTEL_CONVENIO' AND h.id=a.documentoId AND h.empresaId=a.empresaId
   WHERE a.estado='PENDIENTE'
     AND a.proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     AND ((a.proceso='CREDITO_CLIENTE' AND (
            c.id IS NULL OR c.estadoSolicitudCredito<>'PENDIENTE' OR c.activo=0
            OR a.documentoVersion<>c.versionSolicitudCredito
          ))
       OR (a.proceso='HOTEL_CONVENIO' AND (h.id IS NULL OR h.estado<>'PENDIENTE' OR h.activo=0)));
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','APROBACION_HUERFANA',@cantidad,
    N'Niveles pendientes cuyo documento ya no está en revisión.'
  );

  SELECT @cantidad = COUNT_BIG(*)
  FROM (
    SELECT empresaId, proceso, documentoId, COUNT(DISTINCT ciclo) ciclos
      FROM dbo.aprobaciones_documentos
     WHERE estado='PENDIENTE'
       AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     GROUP BY empresaId, proceso, documentoId
    HAVING COUNT(DISTINCT ciclo)>1
  ) x;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','CICLOS_PENDIENTES_DUPLICADOS',@cantidad,
    N'Un documento tiene más de un ciclo de aprobación pendiente.'
  );

  SELECT @cantidad = COUNT_BIG(*)
  FROM (
    SELECT empresaId, proceso, documentoId, ciclo, resueltoPorId
      FROM dbo.aprobaciones_documentos
     WHERE estado IN ('APROBADA','OMITIDA') AND resueltoPorId IS NOT NULL
       AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     GROUP BY empresaId, proceso, documentoId, ciclo, resueltoPorId
    HAVING COUNT_BIG(*)>1
  ) x;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','MISMO_RESOLUTOR_DOS_NIVELES',@cantidad,
    N'La misma persona resolvió más de un nivel del mismo ciclo.'
  );

  SELECT @cantidad = COUNT_BIG(*)
  FROM (
    SELECT empresaId, proceso, usuarioId
      FROM dbo.configuraciones_aprobacion
     WHERE activo=1 AND usuarioId IS NOT NULL
       AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
     GROUP BY empresaId, proceso, usuarioId
    HAVING COUNT_BIG(*)>1
  ) x;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'ALTA','APROBADOR_ESPECIFICO_REPETIDO',@cantidad,
    N'Una misma persona está configurada en más de un nivel del mismo flujo.'
  );

  IF OBJECT_ID('dbo.Usuarios','U') IS NOT NULL
  BEGIN
    SELECT @cantidad = COUNT_BIG(*)
      FROM dbo.configuraciones_aprobacion cfg
     WHERE cfg.activo=1 AND cfg.rolAprobador IS NOT NULL
       AND cfg.proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
       AND NOT EXISTS (
         SELECT 1 FROM dbo.Usuarios u
          WHERE u.empresaId=cfg.empresaId AND u.activo=1
            AND UPPER(REPLACE(REPLACE(LTRIM(RTRIM(u.rol)),'-','_'),' ','_')) =
                UPPER(REPLACE(REPLACE(LTRIM(RTRIM(cfg.rolAprobador)),'-','_'),' ','_'))
       );
    IF @cantidad>0 INSERT #Hallazgos VALUES (
      'CRITICA','ROL_SIN_USUARIOS',@cantidad,
      N'Niveles configurados para un rol que no tiene usuarios activos.'
    );
  END;

  IF OBJECT_ID('dbo.hoteleria_city_ledger_cuentas','U') IS NOT NULL
     AND COL_LENGTH('dbo.hoteleria_city_ledger_cuentas','convenioVersion') IS NOT NULL
  BEGIN
    SELECT @cantidad=COUNT_BIG(*)
      FROM dbo.hoteleria_city_ledger_cuentas
     WHERE ISNULL(convenioVersion,0)<=0
        OR numeroConvenioSnapshot IS NULL
        OR tipoConvenioSnapshot NOT IN ('EMPRESA','AGENCIA')
        OR ISNULL(limiteCreditoAplicado,0)<=0
        OR ISNULL(diasCreditoAplicados,0)<=0
        OR ISNULL(versionCreditoClienteAplicada,0)<=0;
    IF @cantidad>0 INSERT #Hallazgos VALUES (
      'ALTA','CUENTA_CITY_LEDGER_SIN_EVIDENCIA',@cantidad,
      N'Hay cuentas sin snapshot completo de convenio, límite, plazo o versión de crédito aplicados.'
    );
  END;

  IF OBJECT_ID('dbo.hoteleria_city_ledger_cuentas','U') IS NOT NULL
     AND OBJECT_ID('dbo.creditos_clientes','U') IS NOT NULL
  BEGIN
    ;WITH exposicion AS (
      SELECT c.empresaId, c.id clienteId, c.limiteCredito,
             ISNULL(v.saldo,0)+ISNULL(h.saldo,0) utilizado
        FROM dbo.clientes c
        OUTER APPLY (
          SELECT SUM(saldoPendiente) saldo FROM dbo.creditos_clientes
           WHERE empresaId=c.empresaId AND clienteId=c.id AND estado IN ('ACTIVO','VENCIDO')
        ) v
        OUTER APPLY (
          SELECT SUM(saldoPendiente) saldo FROM dbo.hoteleria_city_ledger_cuentas
           WHERE empresaId=c.empresaId AND clienteId=c.id AND estado IN ('ABIERTA','VENCIDA')
        ) h
    )
    SELECT @cantidad=COUNT_BIG(*) FROM exposicion
     WHERE utilizado-ISNULL(limiteCredito,0)>0.009;
    IF @cantidad>0 INSERT #Hallazgos VALUES (
      'ALTA','EXPOSICION_SUPERA_LIMITE',@cantidad,
      N'Clientes cuya exposición combinada Ventas + City Ledger supera la línea maestra.'
    );
  END;

  SELECT @cantidad=COUNT_BIG(*)
  FROM (
    SELECT empresaId, hotelId, numeroConvenio FROM dbo.hoteleria_convenios_credito
     GROUP BY empresaId, hotelId, numeroConvenio HAVING COUNT_BIG(*)>1
  ) x;
  IF @cantidad>0 INSERT #Hallazgos VALUES (
    'CRITICA','NUMERO_CONVENIO_DUPLICADO',@cantidad,
    N'Números de convenio duplicados dentro del mismo hotel.'
  );
END;

SELECT severidad, codigo, cantidad, detalle
  FROM #Hallazgos
 ORDER BY CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END, codigo;

SELECT
  CASE WHEN EXISTS(SELECT 1 FROM #Hallazgos WHERE severidad IN ('CRITICA','ALTA'))
       THEN 'NO_APTO' ELSE 'COHERENTE' END resultado,
  COALESCE(SUM(CASE WHEN severidad='CRITICA' THEN cantidad ELSE 0 END),0) hallazgosCriticos,
  COALESCE(SUM(CASE WHEN severidad='ALTA' THEN cantidad ELSE 0 END),0) hallazgosAltos
FROM #Hallazgos;
