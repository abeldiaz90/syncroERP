SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.importaciones_inventario', 'U') IS NULL
  THROW 51000, 'No existe dbo.importaciones_inventario. Ejecuta primero las migraciones anteriores.', 1;

IF COL_LENGTH('dbo.importaciones_inventario', 'asiento_pendiente_id') IS NULL
  ALTER TABLE dbo.importaciones_inventario ADD asiento_pendiente_id uniqueidentifier NULL;

IF OBJECT_ID('dbo.importaciones_inventario_filas_aplicadas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.importaciones_inventario_filas_aplicadas(
    id uniqueidentifier NOT NULL CONSTRAINT DF_import_filas_id_rc6_sql DEFAULT NEWSEQUENTIALID(),
    empresaId uniqueidentifier NOT NULL,
    importacionId uniqueidentifier NOT NULL,
    numeroFila int NOT NULL,
    productoId uniqueidentifier NOT NULL,
    almacenId uniqueidentifier NOT NULL,
    cantidad decimal(18,4) NOT NULL,
    costoUnitario decimal(18,4) NOT NULL,
    lote varchar(120) NULL,
    caducidad date NULL,
    fechaAplicacion datetime2 NOT NULL CONSTRAINT DF_import_filas_fecha_rc6_sql DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_importaciones_inventario_filas_aplicadas_rc6_sql PRIMARY KEY(id),
    CONSTRAINT UQ_import_fila_aplicada_rc6_sql UNIQUE(importacionId, numeroFila)
  );
END;

IF OBJECT_ID('dbo.asientos_pendientes', 'U') IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_import_job_asiento_pendiente')
  ALTER TABLE dbo.importaciones_inventario WITH CHECK
    ADD CONSTRAINT FK_import_job_asiento_pendiente
    FOREIGN KEY(asiento_pendiente_id) REFERENCES dbo.asientos_pendientes(id);

COMMIT TRANSACTION;

SELECT
  COL_LENGTH('dbo.importaciones_inventario', 'asiento_pendiente_id') AS longitud_columna,
  OBJECT_ID('dbo.importaciones_inventario_filas_aplicadas', 'U') AS tabla_filas_aplicadas;
