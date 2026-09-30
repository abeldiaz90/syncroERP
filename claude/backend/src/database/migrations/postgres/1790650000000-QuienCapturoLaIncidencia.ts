import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Quién capturó la incidencia
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * `rrhh_incidencias` guardaba `aprobadaPorId` —quién la aprobó— y **no
 * guardaba quién la había registrado**. `crearIncidencia` ni siquiera recibía
 * el usuario que la capturaba.
 *
 * Una incidencia mueve dinero: una falta descuenta días, unas horas extra se
 * pagan dobles o triples. Sin saber quién la capturó faltan las dos cosas:
 *
 *  · NO SE PUEDE CONTROLAR — medido el 30-sep-2026 por pantalla: con la
 *    sesión de `rrhh` se registraron 12 horas extra y se aprobaron en dos
 *    clics, la misma persona, sin un segundo par de ojos.
 *  · Y NO SE PUEDE AUDITAR DESPUÉS, que es lo más grave. Una vez aprobada, la
 *    fila no conservaba de dónde salió. «¿Quién capturó estas doce horas?» no
 *    tenía respuesta en ninguna parte del sistema.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 * Una columna NULA. No cambia el comportamiento de nada: las incidencias que
 * ya existen se quedan sin capturador —porque ese dato nunca se guardó y
 * inventarlo sería peor que no tenerlo— y las nuevas nacen con él.
 *
 * Guardarlo no decide quién aprueba a quién: eso es del organigrama del
 * cliente y se decide aparte. Pero sin este dato ninguna regla de cuatro ojos
 * se puede aplicar ni comprobar. Es el requisito previo, y por eso va primero.
 *
 * `to_regclass` para saltar una instalación donde la tabla aún no exista.
 * ============================================================================
 */
export class QuienCapturoLaIncidencia1790650000000 implements MigrationInterface {
  name = 'QuienCapturoLaIncidencia1790650000000';

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const [fila] = await q.query(`SELECT to_regclass($1) AS tabla`, [tabla]);
    return Boolean(fila?.tabla);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'rrhh_incidencias'))) return;

    await queryRunner.query(
      `ALTER TABLE rrhh_incidencias ADD COLUMN IF NOT EXISTS registradaporid uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'rrhh_incidencias'))) return;

    await queryRunner.query(
      `ALTER TABLE rrhh_incidencias DROP COLUMN IF EXISTS registradaporid`,
    );
  }
}
