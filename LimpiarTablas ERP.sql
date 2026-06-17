-- Asegúrate de estar usando tu base de datos correcta (descomenta y cambia el nombre si es necesario)
-- USE [SyncroERP_DB];
-- GO

-- 1. Declarar variables para los scripts dinámicos
DECLARE @sql_drop_fk NVARCHAR(MAX) = N'';
DECLARE @sql_drop_table NVARCHAR(MAX) = N'';

-- 2. Generar el script para ELIMINAR TODAS LAS LLAVES FORÁNEAS (Foreign Keys)
-- Esto es obligatorio para que SQL Server nos deje borrar las tablas sin error de dependencias
SELECT @sql_drop_fk += 'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(parent_object_id)) + ' DROP CONSTRAINT ' + QUOTENAME(name) + ';' + CHAR(13)
FROM sys.foreign_keys;

-- Ejecutar el borrado de llaves foráneas
EXEC sp_executesql @sql_drop_fk;

-- 3. Generar el script para BORRAR LAS TABLAS (excepto usuario y empresa)
SELECT @sql_drop_table += 'DROP TABLE ' + QUOTENAME(TABLE_SCHEMA) + '.' + QUOTENAME(TABLE_NAME) + ';' + CHAR(13)
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE' 
  -- AQUÍ DEFINIMOS LAS EXCEPCIONES (Asegúrate de que los nombres coincidan exactamente con cómo las creó TypeORM)
  AND TABLE_NAME NOT IN ('usuario', 'empresa'); 

-- Ejecutar el borrado de las tablas
EXEC sp_executesql @sql_drop_table;

PRINT 'Tablas eliminadas con éxito. Las tablas "usuario" y "empresa" se han conservado intactas.';