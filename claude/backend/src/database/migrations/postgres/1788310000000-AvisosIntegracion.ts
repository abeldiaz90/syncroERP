import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Buzón de entrada de la integración.
 *
 * `integracion_eventos` es la salida —lo que el ERP le manda al core— y no
 * tenía contraparte: nada de lo que pasaba allá volvía. Un cobro capturado
 * directamente en el portal del core no llegaba nunca al ERP, ni ese día ni
 * después, y las dos carteras se separaban sin que ningún reporte lo dijera.
 *
 * La huella única es lo que hace seguro el reintento: el core reintenta la
 * entrega y un aviso entregado dos veces no puede contarse dos veces.
 */
export class AvisosIntegracion1788310000000 implements MigrationInterface {
  name = 'AvisosIntegracion1788310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integracion_avisos (
        id            uuid          NOT NULL DEFAULT gen_random_uuid(),
        empresaid     uuid,
        proveedor     varchar(40)   NOT NULL DEFAULT 'fineract',
        entidad       varchar(60)   NOT NULL,
        accion        varchar(60)   NOT NULL,
        tenant        varchar(60),
        idexterno     varchar(120),
        entidadid     uuid,
        tipovinculo   varchar(30),
        cuerpo        jsonb,
        cuerpotexto   text,
        huella        varchar(64)   NOT NULL,
        estado        varchar(20)   NOT NULL DEFAULT 'PENDIENTE',
        diagnostico   varchar(500),
        error         varchar(500),
        resueltopor   uuid,
        resueltoen    timestamptz,
        recibidoen    timestamptz   NOT NULL DEFAULT now(),
        fechacreacion timestamptz   NOT NULL DEFAULT now(),
        fechaactualizacion timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_integracion_avisos PRIMARY KEY (id),
        CONSTRAINT ck_integracion_aviso_estado
          CHECK (estado IN ('PENDIENTE','PROCESADO','IGNORADO','FALLIDO','DESCARTADO'))
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_integracion_aviso_huella
        ON integracion_avisos (huella);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_integracion_aviso_pendientes
        ON integracion_avisos (empresaid, estado, recibidoen DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_integracion_aviso_pendientes;`);
    await queryRunner.query(`DROP INDEX IF EXISTS ux_integracion_aviso_huella;`);
    await queryRunner.query(`DROP TABLE IF EXISTS integracion_avisos;`);
  }
}
