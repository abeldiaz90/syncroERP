import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La traza contable de la nómina guarda el número de cuenta, no su uuid
 * ----------------------------------------------------------------------------
 * `rrhh_polizas_nomina_detalle.cuenta` es `varchar(30)` —dimensionada para un
 * número de cuenta como «601.01»— y el código le estaba escribiendo el uuid de
 * la cuenta, que mide 36. La póliza de devengo fallaba entera con «Alguno de
 * los valores excede la longitud permitida», sin decir qué campo.
 *
 * Aunque hubiera cabido, estaría mal: esta tabla es la traza que lee quien
 * revisa la contabilidad de la nómina, y una lista de uuids no la lee nadie.
 * El número se queda en `cuenta` y el identificador pasa a su propia columna,
 * para poder unir sin depender del texto.
 *
 * Las filas existentes —si las hay— llevan el uuid en `cuenta`; se mueven a la
 * columna nueva y se sustituyen por el número real cuando la cuenta existe.
 * ============================================================================
 */
export class TrazaDeNominaConNumeroDeCuenta1790184000000
  implements MigrationInterface
{
  name = 'TrazaDeNominaConNumeroDeCuenta1790184000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rrhh_polizas_nomina_detalle
        ADD COLUMN IF NOT EXISTS cuentacontableid uuid
    `);

    // Rescate de lo que ya estuviera guardado con el uuid en `cuenta`.
    await queryRunner.query(`
      UPDATE rrhh_polizas_nomina_detalle
         SET cuentacontableid = cuenta::uuid
       WHERE cuentacontableid IS NULL
         AND cuenta ~ '^[0-9a-fA-F-]{36}$'
    `);
    await queryRunner.query(`
      UPDATE rrhh_polizas_nomina_detalle d
         SET cuenta = c.numerocuenta
        FROM cuentas_contables c
       WHERE c.id = d.cuentacontableid
         AND d.cuenta ~ '^[0-9a-fA-F-]{36}$'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rrhh_polizas_nomina_detalle DROP COLUMN IF EXISTS cuentacontableid
    `);
  }
}
