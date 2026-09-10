/*
  SyncroERP · Preflight de integridad RRHH/Nómina
  Ejecutar ANTES de 1786957200000-RemediacionIntegralNomina.
  Este script NO modifica información. Cada consulta debe devolver cero filas,
  salvo los bloques de inventario informativo.
*/
SET NOCOUNT ON;

PRINT '1. Empleados con empresa inexistente';
IF OBJECT_ID('dbo.empresas','U') IS NOT NULL
SELECT e.id,e.empresaId,e.numeroEmpleado
FROM dbo.rrhh_empleados e LEFT JOIN dbo.empresas x ON x.id=e.empresaId
WHERE x.id IS NULL;

PRINT '2. Periodos traslapados por empresa y régimen';
SELECT a.empresaId,a.id periodoA,b.id periodoB,a.regimen,a.fechaInicio,a.fechaFin,b.fechaInicio,b.fechaFin
FROM dbo.rrhh_periodos_nomina a
JOIN dbo.rrhh_periodos_nomina b ON b.empresaId=a.empresaId AND b.regimen=a.regimen AND b.id>a.id
 AND a.fechaInicio<=b.fechaFin AND b.fechaInicio<=a.fechaFin
WHERE ISNULL(a.estado,'') NOT IN ('CANCELADO','REVERTIDO') AND ISNULL(b.estado,'') NOT IN ('CANCELADO','REVERTIDO');

PRINT '3. Recibos cuyo empleado o periodo pertenece a otra empresa';
SELECT r.id,r.empresaId,r.empleadoId,r.periodoId
FROM dbo.rrhh_recibos_nomina r
LEFT JOIN dbo.rrhh_empleados e ON e.id=r.empleadoId AND e.empresaId=r.empresaId
LEFT JOIN dbo.rrhh_periodos_nomina p ON p.id=r.periodoId AND p.empresaId=r.empresaId
WHERE e.id IS NULL OR p.id IS NULL;

PRINT '4. Partidas huérfanas';
SELECT pr.id,pr.reciboId FROM dbo.rrhh_partidas_recibo pr
LEFT JOIN dbo.rrhh_recibos_nomina r ON r.id=pr.reciboId
WHERE r.id IS NULL;

PRINT '5. Préstamos con saldos inválidos o empleados ajenos';
IF OBJECT_ID('dbo.rrhh_prestamos','U') IS NOT NULL
SELECT p.* FROM dbo.rrhh_prestamos p
LEFT JOIN dbo.rrhh_empleados e ON e.id=p.empleadoId AND e.empresaId=p.empresaId
WHERE e.id IS NULL OR p.montoOriginal<=0 OR p.descuentoPeriodo<=0 OR p.saldo<0 OR p.saldo>p.montoOriginal;

PRINT '6. Obligaciones con empleados ajenos o vigencias inválidas';
IF OBJECT_ID('dbo.rrhh_obligaciones_empleado','U') IS NOT NULL
SELECT o.* FROM dbo.rrhh_obligaciones_empleado o
LEFT JOIN dbo.rrhh_empleados e ON e.id=o.empleadoId AND e.empresaId=o.empresaId
WHERE e.id IS NULL OR (o.vigenciaHasta IS NOT NULL AND o.vigenciaHasta<o.vigenciaDesde) OR o.valor<0 OR o.saldo<0;

PRINT '7. Más de una cuenta principal activa/validada por empleado';
IF OBJECT_ID('dbo.rrhh_cuentas_bancarias_empleado','U') IS NOT NULL
SELECT empresaId,empleadoId,COUNT(*) cantidad
FROM dbo.rrhh_cuentas_bancarias_empleado
WHERE principal=1 AND estado='ACTIVA' AND ISNULL(estadoValidacion,'PENDIENTE')='VALIDADA'
GROUP BY empresaId,empleadoId HAVING COUNT(*)>1;

PRINT '8. CLABE legada con longitud o formato inválido';
IF OBJECT_ID('dbo.rrhh_cuentas_bancarias_empleado','U') IS NOT NULL
SELECT id,empresaId,empleadoId,RIGHT(clabe,4) ultimos4
FROM dbo.rrhh_cuentas_bancarias_empleado
WHERE LEN(clabe)<>18 OR clabe LIKE '%[^0-9]%';

PRINT '9. Pagos duplicados por periodo o idempotencia';
IF OBJECT_ID('dbo.rrhh_pagos_nomina','U') IS NOT NULL
BEGIN
 SELECT empresaId,periodoId,COUNT(*) cantidad FROM dbo.rrhh_pagos_nomina GROUP BY empresaId,periodoId HAVING COUNT(*)>1;
 SELECT empresaId,idempotencyKey,COUNT(*) cantidad FROM dbo.rrhh_pagos_nomina WHERE idempotencyKey IS NOT NULL GROUP BY empresaId,idempotencyKey HAVING COUNT(*)>1;
END;

PRINT '10. CFDI o dispersiones huérfanos/multiempresa';
IF OBJECT_ID('dbo.rrhh_cfdi_nomina','U') IS NOT NULL
SELECT c.id,c.empresaId,c.periodoId,c.reciboId FROM dbo.rrhh_cfdi_nomina c
LEFT JOIN dbo.rrhh_periodos_nomina p ON p.id=c.periodoId AND p.empresaId=c.empresaId
LEFT JOIN dbo.rrhh_recibos_nomina r ON r.id=c.reciboId AND r.empresaId=c.empresaId AND r.periodoId=c.periodoId
WHERE p.id IS NULL OR r.id IS NULL;
IF OBJECT_ID('dbo.rrhh_dispersiones_nomina','U') IS NOT NULL
SELECT d.id,d.empresaId,d.periodoId FROM dbo.rrhh_dispersiones_nomina d
LEFT JOIN dbo.rrhh_periodos_nomina p ON p.id=d.periodoId AND p.empresaId=d.empresaId
WHERE p.id IS NULL;

PRINT '11. Periodos en estados definitivos sin hash/snapshot';
SELECT id,empresaId,estado,hashCalculo,versionCalculo
FROM dbo.rrhh_periodos_nomina
WHERE estado IN ('EN_REVISION','APROBADO','CFDI_PREPARADO','TIMBRADO','EN_DISPERSION','PAGADO','CONTABILIZADO','CERRADO')
  AND (hashCalculo IS NULL OR ISNULL(versionCalculo,0)=0);

PRINT '12. Inventario informativo de filas sensibles';
SELECT
 (SELECT COUNT(*) FROM dbo.rrhh_empleados) empleados,
 (SELECT COUNT(*) FROM dbo.rrhh_periodos_nomina) periodos,
 (SELECT COUNT(*) FROM dbo.rrhh_recibos_nomina) recibos,
 (SELECT COUNT(*) FROM dbo.rrhh_partidas_recibo) partidas;
