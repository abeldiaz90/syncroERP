import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConciliacionHistoricaInicial1785477600000 implements MigrationInterface {
  name = 'ConciliacionHistoricaInicial1785477600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      IF OBJECT_ID('conciliaciones_financieras', 'U') IS NULL
      BEGIN
        CREATE TABLE conciliaciones_financieras (
          id uniqueidentifier NOT NULL
            CONSTRAINT PK_conciliaciones_financieras PRIMARY KEY
            CONSTRAINT DF_conciliaciones_financieras_id DEFAULT NEWID(),
          empresaId uniqueidentifier NOT NULL,
          fechaCorte date NOT NULL,
          estado varchar(20) NOT NULL
            CONSTRAINT DF_conciliaciones_financieras_estado DEFAULT 'BORRADOR',
          snapshotJson nvarchar(max) NOT NULL,
          resolucionesJson nvarchar(max) NOT NULL
            CONSTRAINT DF_conciliaciones_financieras_resoluciones DEFAULT '{}',
          creadoPor uniqueidentifier NOT NULL,
          confirmadoPor uniqueidentifier NULL,
          fechaConfirmacion datetime2 NULL,
          version int NOT NULL
            CONSTRAINT DF_conciliaciones_financieras_version DEFAULT 1,
          fechaCreacion datetime2 NOT NULL
            CONSTRAINT DF_conciliaciones_financieras_creacion DEFAULT SYSUTCDATETIME(),
          fechaActualizacion datetime2 NOT NULL
            CONSTRAINT DF_conciliaciones_financieras_actualizacion DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_conciliaciones_financieras_empresa_fecha
          ON conciliaciones_financieras(empresaId, fechaCorte);
      END;
    `);
  }

  public async down(): Promise<void> {
    // No destructiva: el snapshot y las justificaciones son evidencia.
  }
}
