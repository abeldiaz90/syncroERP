import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cancelación de cobranza.
 *
 * El ERP no sabía deshacer un pago: `pagos_cobranza` no tenía forma de decir
 * «este ya no cuenta». Lo único parecido era el estado del asiento contable,
 * que es otra cosa. Un pago mal capturado se quedaba para siempre.
 *
 * No se borra el pago: se marca. Un movimiento de dinero que desaparece de la
 * base es justo lo que una auditoría no puede aceptar.
 */
export class CancelacionCobranza1789430000000 implements MigrationInterface {
  name = 'CancelacionCobranza1789430000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pagos_cobranza
        ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS fechacancelacion timestamptz NULL,
        ADD COLUMN IF NOT EXISTS motivocancelacion varchar(500) NULL,
        ADD COLUMN IF NOT EXISTS canceladoporid uuid NULL,
        ADD COLUMN IF NOT EXISTS origenexterno varchar(100) NULL
    `);

    /*
     * Los pagos vigentes son los que suman. Se indexa por eso: toda consulta
     * de saldo, conciliación y estado de cuenta los filtra.
     */
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IX_pago_cobranza_vigente
        ON pagos_cobranza (empresaid, creditoid)
        WHERE cancelado = false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS IX_pago_cobranza_vigente');
    await queryRunner.query(`
      ALTER TABLE pagos_cobranza
        DROP COLUMN IF EXISTS cancelado,
        DROP COLUMN IF EXISTS fechacancelacion,
        DROP COLUMN IF EXISTS motivocancelacion,
        DROP COLUMN IF EXISTS canceladoporid,
        DROP COLUMN IF EXISTS origenexterno
    `);
  }
}
