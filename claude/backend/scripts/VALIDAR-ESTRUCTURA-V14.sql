/*
  SyncroERP v14 - Verificación no destructiva posterior a migraciones
  Ejecutar en la base objetivo después de:
    npm run db:migration:run

  Resultado esperado: todas las filas con Estado = OK.
*/
SET NOCOUNT ON;

DECLARE @Resultado TABLE (
  Componente nvarchar(150) NOT NULL,
  Estado varchar(10) NOT NULL,
  Detalle nvarchar(500) NOT NULL
);

INSERT INTO @Resultado
SELECT 'Usuarios.tokenVersion',
       IIF(COL_LENGTH('dbo.Usuarios','tokenVersion') IS NOT NULL,'OK','FALTA'),
       'Revocación inmediata de sesiones';
INSERT INTO @Resultado
SELECT 'Usuarios.esPropietario',
       IIF(COL_LENGTH('dbo.Usuarios','esPropietario') IS NOT NULL,'OK','FALTA'),
       'Protección del propietario y activación de empresa';
INSERT INTO @Resultado
SELECT 'configuraciones_fiscales.facturamaPassword',
       IIF(COL_LENGTH('dbo.configuraciones_fiscales','facturamaPassword') IS NOT NULL,'OK','FALTA'),
       'La columna debe soportar el sobre cifrado AES-256-GCM';

IF OBJECT_ID('dbo.configuraciones_fiscales','U') IS NOT NULL
   AND COL_LENGTH('dbo.configuraciones_fiscales','facturamaPassword') IS NOT NULL
  INSERT INTO @Resultado
  SELECT 'Credenciales PAC cifradas',
         IIF(EXISTS(
           SELECT 1 FROM dbo.configuraciones_fiscales
            WHERE NULLIF(LTRIM(RTRIM(facturamaPassword)),'') IS NOT NULL
              AND facturamaPassword NOT LIKE 'v1.%'
         ),'FALTA','OK'),
         'Después del primer arranque con CFDI_ENCRYPTION_KEY no debe quedar ninguna contraseña heredada en texto plano';
INSERT INTO @Resultado
SELECT 'ventas.cambio',
       IIF(COL_LENGTH('dbo.ventas','cambio') IS NOT NULL,'OK','FALTA'),
       'Cambio calculado por el servidor';
INSERT INTO @Resultado
SELECT 'facturas.tipoComprobante',
       IIF(COL_LENGTH('dbo.facturas','tipoComprobante') IS NOT NULL,'OK','FALTA'),
       'CFDI I/E/P';
INSERT INTO @Resultado
SELECT 'facturas.cfdiRelacionadoId',
       IIF(COL_LENGTH('dbo.facturas','cfdiRelacionadoId') IS NOT NULL,'OK','FALTA'),
       'Relación de notas de crédito y complementos';
INSERT INTO @Resultado
SELECT 'pagos_cobranza.estadoFiscal',
       IIF(COL_LENGTH('dbo.pagos_cobranza','estadoFiscal') IS NOT NULL,'OK','FALTA'),
       'Seguimiento de REP pendiente/error/generado';
INSERT INTO @Resultado
SELECT 'pagos_cobranza.complementoPagoId',
       IIF(COL_LENGTH('dbo.pagos_cobranza','complementoPagoId') IS NOT NULL,'OK','FALTA'),
       'Vínculo al CFDI de pagos';
INSERT INTO @Resultado
SELECT 'registros_auditoria.hashRegistro',
       IIF(COL_LENGTH('dbo.registros_auditoria','hashRegistro') IS NOT NULL,'OK','FALTA'),
       'Cadena de integridad de auditoría';
INSERT INTO @Resultado
SELECT 'TR_registros_auditoria_append_only',
       IIF(OBJECT_ID('dbo.TR_registros_auditoria_append_only','TR') IS NOT NULL,'OK','FALTA'),
       'Bloqueo de UPDATE y DELETE';
INSERT INTO @Resultado
SELECT 'IX_rol_endpoint_permisos_lookup',
       IIF(EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.rol_endpoint_permisos') AND name='IX_rol_endpoint_permisos_lookup'),'OK','FALTA'),
       'Índice caliente de permisos multiempresa';

INSERT INTO @Resultado
SELECT 'caja_turnos',
       IIF(OBJECT_ID('dbo.caja_turnos','U') IS NOT NULL,'OK','FALTA'),
       'Apertura, corte y arqueo';
INSERT INTO @Resultado
SELECT 'caja_movimientos',
       IIF(OBJECT_ID('dbo.caja_movimientos','U') IS NOT NULL,'OK','FALTA'),
       'Ventas, cobranza, reembolsos y movimientos manuales';
INSERT INTO @Resultado
SELECT 'UX_caja_turnos_cuenta_abierta',
       IIF(EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.caja_turnos') AND name='UX_caja_turnos_cuenta_abierta'),'OK','FALTA'),
       'Una sola apertura por caja y empresa';
INSERT INTO @Resultado
SELECT 'UX_caja_movimientos_turno_tipo_documento',
       IIF(EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.caja_movimientos') AND name='UX_caja_movimientos_turno_tipo_documento'),'OK','FALTA'),
       'Idempotencia de movimientos ligados a documentos';

;WITH requeridos(tabla) AS (
  SELECT v.tabla
  FROM (VALUES
    ('productos'),('clientes'),('proveedores'),('Usuarios'),
    ('categorias'),('marcas'),('impuestos'),('listas_precio'),
    ('ordenes_compra'),('requisiciones'),('configuraciones_fiscales'),
    ('hoteles'),('reservaciones'),('habitaciones'),('tipos_habitacion')
  ) v(tabla)
), faltantes AS (
  SELECT r.tabla
  FROM requeridos r
  WHERE OBJECT_ID('dbo.' + r.tabla,'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.index_columns ic
      JOIN sys.columns c
        ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE ic.object_id=OBJECT_ID('dbo.' + r.tabla)
        AND c.name='empresaId'
        AND ic.key_ordinal > 0
    )
)
INSERT INTO @Resultado
SELECT 'Índices por empresaId',
       IIF(EXISTS(SELECT 1 FROM faltantes),'FALTA','OK'),
       COALESCE(
         'Sin índice: ' + STUFF((SELECT ', ' + tabla FROM faltantes ORDER BY tabla FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),1,2,''),
         'Las tablas críticas existentes tienen empresaId indexado'
       );

SELECT Componente, Estado, Detalle
FROM @Resultado
ORDER BY CASE Estado WHEN 'FALTA' THEN 0 ELSE 1 END, Componente;

IF EXISTS (SELECT 1 FROM @Resultado WHERE Estado <> 'OK')
  THROW 51014, 'La estructura v14 está incompleta. Revisa los componentes marcados como FALTA.', 1;
