import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Una nómina rechazada tiene que poder volver a enviarse
 * ----------------------------------------------------------------------------
 * Rechazar es el camino normal: alguien mira la prenómina, ve algo mal, la
 * rechaza, se corrige y se vuelve a enviar. Pero el índice único de las
 * aprobaciones era (empresa, periodo, nivel), así que en toda la vida del
 * periodo sólo cabía un flujo, y `prepararAprobacion` contestaba «El flujo de
 * aprobación ya fue preparado».
 *
 * O sea: rechazar una nómina la dejaba calculable y jamás aprobable. El
 * periodo 18 acabó ahí en la primera corrida real.
 *
 * El ciclo entra en el índice. Cada envío abre uno nuevo; los anteriores
 * quedan como historia —incluidos los niveles que se quedaron pendientes
 * cuando otro rechazó— y sólo el vigente se puede firmar.
 * ============================================================================
 */
export class CicloDeAprobacionNomina1790142000000 implements MigrationInterface {
  name = 'CicloDeAprobacionNomina1790142000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rrhh_aprobaciones_nomina
        ADD COLUMN IF NOT EXISTS ciclo integer NOT NULL DEFAULT 1
    `);

    // El índice viejo es justo el que impedía el segundo envío.
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_rrhh_aprobaciones_nomina_empresaid_periodoid_nivel"
    `);
    await queryRunner.query(`
      DO $$
      DECLARE nombre text;
      BEGIN
        FOR nombre IN
          SELECT i.relname
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
           WHERE t.relname = 'rrhh_aprobaciones_nomina'
             AND x.indisunique
             AND NOT x.indisprimary
             AND array_length(x.indkey::int[], 1) = 3
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', nombre);
        END LOOP;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_aprobacion_nomina_ciclo_nivel"
        ON rrhh_aprobaciones_nomina (empresaid, periodoid, ciclo, nivel)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_aprobacion_nomina_ciclo_nivel"`);
    await queryRunner.query(`
      ALTER TABLE rrhh_aprobaciones_nomina DROP COLUMN IF EXISTS ciclo
    `);
  }
}
