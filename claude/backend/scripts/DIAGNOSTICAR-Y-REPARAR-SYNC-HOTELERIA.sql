/*
  EJECUTAR PRIMERO SOBRE UNA COPIA O CON RESPALDO.
  Este script NO elimina columnas. Agrega version con DEFAULT y muestra el
  estado de la tabla de pagos hoteleros. La migración TypeORM realiza el resto.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

SELECT
  DB_NAME() AS baseDatos,
  COL_LENGTH('dbo.folios','version') AS foliosVersionBytes,
  OBJECT_ID('dbo.pagos_folio_hotel','U') AS pagosHotelObjectId;

SELECT c.name AS columna, t.name AS tipo, c.max_length, c.is_nullable
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.pagos_folio_hotel')
ORDER BY c.column_id;

BEGIN TRANSACTION;

IF COL_LENGTH('dbo.folios','version') IS NULL
  ALTER TABLE dbo.folios
    ADD version int NOT NULL
    CONSTRAINT DF_folios_version DEFAULT (1) WITH VALUES;

SELECT COUNT(*) AS folios, MIN(version) AS versionMinima, MAX(version) AS versionMaxima
FROM dbo.folios;

COMMIT TRANSACTION;
