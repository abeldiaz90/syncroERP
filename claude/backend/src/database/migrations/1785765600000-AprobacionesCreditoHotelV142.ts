import { MigrationInterface, QueryRunner } from 'typeorm';

export class AprobacionesCreditoHotelV1421785765600000
  implements MigrationInterface
{
  name = 'AprobacionesCreditoHotelV1421785765600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('aprobaciones_documentos','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('aprobaciones_documentos','ciclo') IS NULL
          ALTER TABLE aprobaciones_documentos
            ADD ciclo int NOT NULL
              CONSTRAINT DF_aprobaciones_documentos_ciclo DEFAULT 1;

        IF COL_LENGTH('aprobaciones_documentos','obligatorio') IS NULL
          ALTER TABLE aprobaciones_documentos
            ADD obligatorio bit NOT NULL
              CONSTRAINT DF_aprobaciones_documentos_obligatorio DEFAULT 1;

        IF COL_LENGTH('aprobaciones_documentos','permiteAutoaprobacion') IS NULL
          ALTER TABLE aprobaciones_documentos
            ADD permiteAutoaprobacion bit NOT NULL
              CONSTRAINT DF_aprobaciones_documentos_auto DEFAULT 0;

        IF COL_LENGTH('aprobaciones_documentos','importeSolicitado') IS NULL
          ALTER TABLE aprobaciones_documentos
            ADD importeSolicitado decimal(18,2) NOT NULL
              CONSTRAINT DF_aprobaciones_documentos_importe DEFAULT 0;

        DECLARE @indiceAnterior sysname;
        SELECT TOP 1 @indiceAnterior = i.name
          FROM sys.indexes i
          INNER JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
          INNER JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
         WHERE i.object_id=OBJECT_ID('aprobaciones_documentos')
           AND i.is_unique=1
         GROUP BY i.name
        HAVING SUM(CASE WHEN c.name IN ('empresaId','proceso','documentoId','nivel') THEN 1 ELSE 0 END)=4
           AND SUM(CASE WHEN c.name='ciclo' THEN 1 ELSE 0 END)=0
           AND COUNT(*)=4;

        IF @indiceAnterior IS NOT NULL
          EXEC('DROP INDEX [' + @indiceAnterior + '] ON aprobaciones_documentos');

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('aprobaciones_documentos')
             AND name='UX_aprobacion_documento_ciclo_nivel'
        )
          CREATE UNIQUE INDEX UX_aprobacion_documento_ciclo_nivel
            ON aprobaciones_documentos(empresaId,proceso,documentoId,ciclo,nivel);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('aprobaciones_documentos')
             AND name='IX_aprobacion_documento_bandeja'
        )
          CREATE INDEX IX_aprobacion_documento_bandeja
            ON aprobaciones_documentos(
              empresaId,estado,usuarioAprobadorId,rolAprobador,fechaVencimiento
            );
      END

      IF OBJECT_ID('hoteleria_convenios_credito','U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('hoteleria_convenios_credito','suspendidoPorId') IS NULL
          ALTER TABLE hoteleria_convenios_credito
            ADD suspendidoPorId uniqueidentifier NULL;

        IF COL_LENGTH('hoteleria_convenios_credito','fechaSuspension') IS NULL
          ALTER TABLE hoteleria_convenios_credito
            ADD fechaSuspension datetime2 NULL;

        IF EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='UX_hotel_convenio_empresa_numero'
        )
          DROP INDEX UX_hotel_convenio_empresa_numero
            ON hoteleria_convenios_credito;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('hoteleria_convenios_credito')
             AND name='UX_hotel_convenio_hotel_numero'
        )
          CREATE UNIQUE INDEX UX_hotel_convenio_hotel_numero
            ON hoteleria_convenios_credito(empresaId,hotelId,numeroConvenio);
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('aprobaciones_documentos','U') IS NOT NULL
      BEGIN
        IF EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('aprobaciones_documentos')
             AND name='IX_aprobacion_documento_bandeja'
        ) DROP INDEX IX_aprobacion_documento_bandeja ON aprobaciones_documentos;

        IF EXISTS (
          SELECT 1 FROM sys.indexes
           WHERE object_id=OBJECT_ID('aprobaciones_documentos')
             AND name='UX_aprobacion_documento_ciclo_nivel'
        ) DROP INDEX UX_aprobacion_documento_ciclo_nivel ON aprobaciones_documentos;
      END
    `);
  }
}
