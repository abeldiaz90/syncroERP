/*
  Cierre mensual guiado — SQL Server.
  Idempotente. Ejecutar con respaldo previo.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('cierres_contables', 'U') IS NULL
BEGIN
  CREATE TABLE cierres_contables (
    id uniqueidentifier NOT NULL
      CONSTRAINT PK_cierres_contables PRIMARY KEY
      CONSTRAINT DF_cierres_contables_id DEFAULT NEWID(),
    empresaId uniqueidentifier NOT NULL,
    mes int NOT NULL,
    anio int NOT NULL,
    usuarioId uniqueidentifier NOT NULL,
    notas varchar(500) NULL,
    revisionId uniqueidentifier NULL,
    fechaCierre datetime2 NOT NULL
      CONSTRAINT DF_cierres_contables_fecha DEFAULT SYSUTCDATETIME()
  );
END;

IF COL_LENGTH('cierres_contables', 'revisionId') IS NULL
  ALTER TABLE cierres_contables ADD revisionId uniqueidentifier NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('cierres_contables')
    AND name = 'UX_cierres_contables_empresa_periodo'
)
AND NOT EXISTS (
  SELECT 1 FROM cierres_contables
  GROUP BY empresaId, anio, mes HAVING COUNT(*) > 1
)
  CREATE UNIQUE INDEX UX_cierres_contables_empresa_periodo
    ON cierres_contables(empresaId, anio, mes);

IF OBJECT_ID('revisiones_cierre_mensual', 'U') IS NULL
BEGIN
  CREATE TABLE revisiones_cierre_mensual (
    id uniqueidentifier NOT NULL
      CONSTRAINT PK_revisiones_cierre_mensual PRIMARY KEY
      CONSTRAINT DF_revisiones_cierre_id DEFAULT NEWID(),
    empresaId uniqueidentifier NOT NULL,
    mes int NOT NULL,
    anio int NOT NULL,
    estado varchar(20) NOT NULL
      CONSTRAINT DF_revisiones_cierre_estado DEFAULT 'BORRADOR',
    snapshotJson nvarchar(max) NOT NULL,
    confirmacionesJson nvarchar(max) NOT NULL
      CONSTRAINT DF_revisiones_cierre_confirmaciones DEFAULT '{}',
    notas nvarchar(500) NULL,
    creadoPor uniqueidentifier NOT NULL,
    revisadoPor uniqueidentifier NULL,
    fechaRevision datetime2 NULL,
    cierreId uniqueidentifier NULL,
    version int NOT NULL
      CONSTRAINT DF_revisiones_cierre_version DEFAULT 1,
    fechaCreacion datetime2 NOT NULL
      CONSTRAINT DF_revisiones_cierre_creacion DEFAULT SYSUTCDATETIME(),
    fechaActualizacion datetime2 NOT NULL
      CONSTRAINT DF_revisiones_cierre_actualizacion DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_revisiones_cierre_empresa_periodo
    ON revisiones_cierre_mensual(empresaId, anio, mes);
END;

IF OBJECT_ID('eventos_cierre_contable', 'U') IS NULL
BEGIN
  CREATE TABLE eventos_cierre_contable (
    id uniqueidentifier NOT NULL
      CONSTRAINT PK_eventos_cierre_contable PRIMARY KEY
      CONSTRAINT DF_eventos_cierre_id DEFAULT NEWID(),
    empresaId uniqueidentifier NOT NULL,
    mes int NOT NULL,
    anio int NOT NULL,
    tipo varchar(20) NOT NULL,
    usuarioId uniqueidentifier NOT NULL,
    cierreId uniqueidentifier NULL,
    revisionId uniqueidentifier NULL,
    motivo nvarchar(500) NULL,
    evidenciaJson nvarchar(max) NOT NULL,
    fechaEvento datetime2 NOT NULL
      CONSTRAINT DF_eventos_cierre_fecha DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_eventos_cierre_empresa_periodo
    ON eventos_cierre_contable(empresaId, anio, mes);
END;

COMMIT TRANSACTION;
