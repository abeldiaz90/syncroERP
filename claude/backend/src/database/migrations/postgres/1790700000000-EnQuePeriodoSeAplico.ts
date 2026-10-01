import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * En qué periodo se aplicó la incidencia
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * `estadoAprobacion = 'APLICADA'` decía que la incidencia ya había movido un
 * recibo, pero no decía CUÁL. Y el cálculo de nómina toma todas las
 * incidencias `APROBADA` o `APLICADA` cuyo rango se cruce con el periodo:
 *
 *   · dos periodos que se solapen la toman los dos;
 *   · y recalcular un periodo distinto del que la consumió la vuelve a cobrar.
 *
 * No se había notado porque hasta el 30-sep-2026 ninguna incidencia se
 * aplicaba fuera de su propio periodo, y los periodos no se solapan si se
 * capturan bien.
 *
 * Eso cambia hoy. Medido por pantalla ese mismo día: una falta del 30-sep se
 * aprobó cuando su periodo (#18, 16–30 sep) ya estaba PAGADO. El cálculo sólo
 * mira el rango del periodo, así que esa falta no se aplicó en el suyo y no se
 * aplicaría nunca en ningún otro: se quedaba APROBADA para siempre, contada en
 * el indicador «Días no pagados» de la pantalla y descontada de nadie.
 *
 * Por decisión de Abel del 30-sep-2026 esas incidencias atrasadas pasan a
 * aplicarse RETROACTIVAMENTE en el siguiente periodo que se calcule. Con eso,
 * «¿en qué periodo se aplicó?» deja de ser una curiosidad y pasa a ser lo
 * único que impide cobrarla dos veces.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 * Una columna NULA. Las incidencias ya aplicadas se quedan sin periodo —ese
 * dato nunca se guardó, y deducirlo del rango sería adivinar—, lo cual es
 * seguro: el candado nuevo sólo excluye lo que tiene un periodo DISTINTO
 * anotado, así que una fila con NULL se comporta exactamente como hoy.
 *
 * `to_regclass` para saltar una instalación donde la tabla aún no exista.
 * ============================================================================
 */
export class EnQuePeriodoSeAplico1790700000000 implements MigrationInterface {
  name = 'EnQuePeriodoSeAplico1790700000000';

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const [fila] = await q.query(`SELECT to_regclass($1) AS tabla`, [tabla]);
    return Boolean(fila?.tabla);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'rrhh_incidencias'))) return;

    await queryRunner.query(
      `ALTER TABLE rrhh_incidencias ADD COLUMN IF NOT EXISTS periodoaplicadoid uuid NULL`,
    );

    /*
     * Índice parcial: las consultas del cálculo preguntan siempre por las que
     * todavía no se aplicaron en ningún lado, que con el tiempo son pocas
     * frente al histórico entero.
     */
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_incidencias_sin_aplicar
         ON rrhh_incidencias (empresaid, fechafin)
         WHERE periodoaplicadoid IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'rrhh_incidencias'))) return;

    await queryRunner.query(`DROP INDEX IF EXISTS idx_incidencias_sin_aplicar`);
    await queryRunner.query(
      `ALTER TABLE rrhh_incidencias DROP COLUMN IF EXISTS periodoaplicadoid`,
    );
  }
}
