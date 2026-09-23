import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Los días por los que cobra el IMSS se guardan en el recibo
 * ----------------------------------------------------------------------------
 * El recibo guardaba `diaspagados` y no los días cotizados. No son lo mismo:
 * una incapacidad no se paga y tampoco se cotiza, y una falta injustificada se
 * descuenta del pago pero aquí no de la cotización —descontarla es potestativo
 * (LSS art. 31) y cotizar de menos sí genera diferencia a cargo del patrón.
 *
 * En la primera nómina que se corrió, el empleado tenía 14 días pagados y 15
 * cotizados. Las cuotas salieron de los 15, correctamente, pero ese 15 sólo
 * quedaba dentro del `snapshotjson`. El SUA y la liquidación bimestral se
 * arman con ese número: tenerlo enterrado en un JSON obliga a recalcularlo o a
 * parsear recibo por recibo, y dos cálculos del mismo dato acaban discrepando
 * el día que uno de los dos cambie.
 *
 * Los recibos que ya existen se rellenan desde su propio snapshot cuando lo
 * traen, y con los días pagados cuando no, que es el valor correcto para un
 * periodo sin incidencias.
 * ============================================================================
 */
export class DiasCotizadosEnElRecibo1790140000000 implements MigrationInterface {
  name = 'DiasCotizadosEnElRecibo1790140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rrhh_recibos_nomina
        ADD COLUMN IF NOT EXISTS diascotizados decimal(5,2) NOT NULL DEFAULT 0
    `);

    // Rescate desde el snapshot, que es donde vivía hasta ahora.
    await queryRunner.query(`
      UPDATE rrhh_recibos_nomina
         SET diascotizados = COALESCE(
               NULLIF((snapshotjson::json -> 'calculo' ->> 'diasCotizados'), '')::decimal,
               diaspagados
             )
       WHERE diascotizados = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rrhh_recibos_nomina DROP COLUMN IF EXISTS diascotizados
    `);
  }
}
