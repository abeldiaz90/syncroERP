/*
  Wizard Maestro de Finanzas — SQL Server
  Idempotente. Ejecutar con respaldo previo.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('activaciones_financieras', 'U') IS NULL
BEGIN
  CREATE TABLE activaciones_financieras (
    id uniqueidentifier NOT NULL
      CONSTRAINT PK_activaciones_financieras PRIMARY KEY
      CONSTRAINT DF_activaciones_financieras_id DEFAULT NEWID(),
    empresaId uniqueidentifier NOT NULL,
    estado varchar(30) NOT NULL
      CONSTRAINT DF_activaciones_financieras_estado DEFAULT 'NO_INICIADO',
    modo varchar(15) NULL,
    pasoActual int NOT NULL
      CONSTRAINT DF_activaciones_financieras_paso DEFAULT 1,
    fechaInicioContable date NULL,
    empresaEnOperacion bit NULL,
    configuracionJson nvarchar(max) NOT NULL
      CONSTRAINT DF_activaciones_financieras_config DEFAULT '{}',
    diagnosticoJson nvarchar(max) NULL,
    version int NOT NULL
      CONSTRAINT DF_activaciones_financieras_version DEFAULT 1,
    activadoPor uniqueidentifier NULL,
    fechaActivacion datetime2 NULL,
    fechaCreacion datetime2 NOT NULL
      CONSTRAINT DF_activaciones_financieras_creacion DEFAULT SYSUTCDATETIME(),
    fechaActualizacion datetime2 NOT NULL
      CONSTRAINT DF_activaciones_financieras_actualizacion DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_activaciones_financieras_empresa UNIQUE (empresaId)
  );
END;

INSERT INTO activaciones_financieras (
  id, empresaId, estado, pasoActual, configuracionJson, version,
  fechaCreacion, fechaActualizacion
)
SELECT
  NEWID(), e.id, 'PENDIENTE_REVISION', 1, '{}', 1,
  SYSUTCDATETIME(), SYSUTCDATETIME()
FROM Empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM activaciones_financieras a WHERE a.empresaId = e.id
);

COMMIT TRANSACTION;
