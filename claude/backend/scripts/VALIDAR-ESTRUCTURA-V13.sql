/*
  SyncroERP v13 · Validación no destructiva de estructura crítica
  Ejecutar en la base objetivo antes de desplegar backend v13.
  No crea, modifica ni elimina objetos.
*/
SET NOCOUNT ON;

DECLARE @Requeridos TABLE (
  Esquema sysname NOT NULL,
  Tabla sysname NOT NULL,
  Columna sysname NULL,
  Motivo nvarchar(300) NOT NULL
);

INSERT INTO @Requeridos (Esquema, Tabla, Columna, Motivo)
VALUES
  ('dbo', 'roles', NULL, 'IAM y permisos dinámicos'),
  ('dbo', 'roles', 'id', 'Identificador del rol'),
  ('dbo', 'roles', 'nombre', 'Nombre único del rol'),

  ('dbo', 'rrhh_empleados', 'id', 'Expediente laboral'),
  ('dbo', 'rrhh_empleados', 'empresaId', 'Aislamiento multiempresa'),
  ('dbo', 'rrhh_empleados', 'estado', 'Baja transaccional'),
  ('dbo', 'rrhh_empleados', 'fechaIngreso', 'Cálculo de finiquito'),
  ('dbo', 'rrhh_empleados', 'fechaBaja', 'Baja transaccional'),
  ('dbo', 'rrhh_empleados', 'motivoBaja', 'Trazabilidad de baja'),
  ('dbo', 'rrhh_empleados', 'puestoId', 'Asignación organizacional'),
  ('dbo', 'rrhh_empleados', 'departamentoId', 'Asignación organizacional'),
  ('dbo', 'rrhh_empleados', 'salarioDiario', 'Contrato y finiquito'),
  ('dbo', 'rrhh_empleados', 'salarioDiarioIntegrado', 'Contrato y nómina'),

  ('dbo', 'rrhh_puestos', 'id', 'Catálogo de puestos'),
  ('dbo', 'rrhh_puestos', 'departamentoId', 'Consistencia puesto-área'),
  ('dbo', 'rrhh_puestos', 'salarioMinimo', 'Tabulador salarial'),
  ('dbo', 'rrhh_puestos', 'salarioMaximo', 'Tabulador salarial'),
  ('dbo', 'rrhh_puestos', 'plazasAutorizadas', 'Control de plantilla'),
  ('dbo', 'rrhh_puestos', 'activo', 'Validación de vigencia'),

  ('dbo', 'rrhh_contratos_laborales', NULL, 'Pantalla e historial de contratos'),
  ('dbo', 'rrhh_contratos_laborales', 'id', 'Identificador del contrato'),
  ('dbo', 'rrhh_contratos_laborales', 'empresaId', 'Aislamiento multiempresa'),
  ('dbo', 'rrhh_contratos_laborales', 'empleadoId', 'Relación con empleado'),
  ('dbo', 'rrhh_contratos_laborales', 'tipoContrato', 'Tipo de relación laboral'),
  ('dbo', 'rrhh_contratos_laborales', 'fechaInicio', 'Vigencia del contrato'),
  ('dbo', 'rrhh_contratos_laborales', 'fechaFin', 'Cierre de vigencia'),
  ('dbo', 'rrhh_contratos_laborales', 'salarioDiario', 'Salario contractual'),
  ('dbo', 'rrhh_contratos_laborales', 'salarioDiarioIntegrado', 'SBC contractual'),
  ('dbo', 'rrhh_contratos_laborales', 'puestoId', 'Puesto contractual'),
  ('dbo', 'rrhh_contratos_laborales', 'departamentoId', 'Área contractual'),
  ('dbo', 'rrhh_contratos_laborales', 'vigente', 'Contrato actual'),

  ('dbo', 'rrhh_movimientos_laborales', NULL, 'Historial y auditoría laboral'),
  ('dbo', 'rrhh_movimientos_laborales', 'id', 'Identificador del movimiento'),
  ('dbo', 'rrhh_movimientos_laborales', 'empresaId', 'Aislamiento multiempresa'),
  ('dbo', 'rrhh_movimientos_laborales', 'empleadoId', 'Relación con empleado'),
  ('dbo', 'rrhh_movimientos_laborales', 'tipo', 'Tipo de movimiento'),
  ('dbo', 'rrhh_movimientos_laborales', 'fechaEfectiva', 'Fecha del movimiento'),
  ('dbo', 'rrhh_movimientos_laborales', 'valoresAnterioresJson', 'Auditoría anterior'),
  ('dbo', 'rrhh_movimientos_laborales', 'valoresNuevosJson', 'Auditoría posterior'),
  ('dbo', 'rrhh_movimientos_laborales', 'motivo', 'Justificación'),
  ('dbo', 'rrhh_movimientos_laborales', 'usuarioId', 'Actor responsable'),

  ('dbo', 'hoteleria_convenios_credito', NULL, 'City Ledger: convenios'),
  ('dbo', 'hoteleria_city_ledger_cuentas', NULL, 'City Ledger: cartera'),
  ('dbo', 'hoteleria_city_ledger_cobros', NULL, 'City Ledger: cobranza'),

  ('dbo', 'ventas', 'empresaId', 'Panel ejecutivo'),
  ('dbo', 'ventas', 'fechaVenta', 'Panel ejecutivo'),
  ('dbo', 'ventas', 'total', 'Panel ejecutivo'),
  ('dbo', 'ventas', 'totalDevuelto', 'Panel ejecutivo'),
  ('dbo', 'stock_por_almacen', 'cantidad', 'Panel ejecutivo e inventario'),
  ('dbo', 'creditos_clientes', 'saldoPendiente', 'Panel ejecutivo y CxC');

;WITH Faltantes AS (
  SELECT
    r.Esquema,
    r.Tabla,
    r.Columna,
    r.Motivo,
    CASE
      WHEN OBJECT_ID(QUOTENAME(r.Esquema) + '.' + QUOTENAME(r.Tabla), 'U') IS NULL
        THEN 'TABLA_FALTANTE'
      WHEN r.Columna IS NOT NULL AND COL_LENGTH(r.Esquema + '.' + r.Tabla, r.Columna) IS NULL
        THEN 'COLUMNA_FALTANTE'
    END AS Problema
  FROM @Requeridos r
)
SELECT Problema, Esquema, Tabla, Columna, Motivo
FROM Faltantes
WHERE Problema IS NOT NULL
ORDER BY
  CASE Problema WHEN 'TABLA_FALTANTE' THEN 1 ELSE 2 END,
  Tabla,
  Columna;

DECLARE @TotalFaltantes int = (
  SELECT COUNT(*)
  FROM @Requeridos r
  WHERE OBJECT_ID(QUOTENAME(r.Esquema) + '.' + QUOTENAME(r.Tabla), 'U') IS NULL
     OR (r.Columna IS NOT NULL AND COL_LENGTH(r.Esquema + '.' + r.Tabla, r.Columna) IS NULL)
);

IF @TotalFaltantes = 0
  PRINT 'OK: la estructura crítica requerida por SyncroERP v13 está disponible.';
ELSE
BEGIN
  PRINT CONCAT('ERROR: se detectaron ', @TotalFaltantes, ' requisitos de estructura faltantes.');
  THROW 51013, 'La base no cumple la estructura crítica de SyncroERP v13. Revisa el primer result set.', 1;
END;
