import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La tabla de identidades hablaba un idioma que nadie le preguntaba
 * ----------------------------------------------------------------------------
 * `empresa_identidad` se creo con las columnas entrecomilladas en camelCase
 * —`"empresaId"`, `"clientIdPublico"`…— mientras el proyecto entero usa
 * `LowercaseNamingStrategy`, que le pide a Postgres `empresaid`,
 * `clientidpublico`. Postgres conserva las mayusculas de un identificador
 * entrecomillado y baja las del que no lo esta, asi que las dos formas jamas se
 * encontraron: TODA consulta contra esa tabla moria con
 *
 *   column EmpresaIdentidad.empresaid does not exist
 *   HINT: Perhaps you meant to reference the column "EmpresaIdentidad.empresaId".
 *
 * Y no se veia. Las busquedas de identidad estan envueltas en try/catch, de
 * modo que el error se tragaba y el sistema seguia como si la empresa no
 * tuviera realm propio: la separacion por inquilino existia en la tabla y no
 * llegaba a aplicarse nunca. Se descubrio leyendo el log de Postgres mientras
 * se cazaba otra cosa; en la pantalla no aparecia nada.
 *
 * Aqui se renombran donde ya existen. Es idempotente: si la columna en
 * minusculas ya esta —instalacion nueva, o esta migracion ya corrio— no hace
 * nada.
 * ============================================================================
 */
export class IdentidadEnMinusculas1790300000000 implements MigrationInterface {
  name = 'IdentidadEnMinusculas1790300000000';

  private static readonly COLUMNAS: Array<[string, string]> = [
    ['empresaId', 'empresaid'],
    ['clientIdPublico', 'clientidpublico'],
    ['clientIdServicio', 'clientidservicio'],
    ['secretoServicio', 'secretoservicio'],
    ['clientIdProvisionador', 'clientidprovisionador'],
    ['secretoProvisionador', 'secretoprovisionador'],
    ['dominiosPermitidos', 'dominiospermitidos'],
    ['aprovisionadoPor', 'aprovisionadopor'],
    ['fechaCreacion', 'fechacreacion'],
    ['fechaActualizacion', 'fechaactualizacion'],
  ];

  private async renombrar(
    queryRunner: QueryRunner,
    desde: string,
    hasta: string,
  ): Promise<void> {
    const existe = await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'empresa_identidad' AND column_name = $1
      `,
      [desde],
    );
    if (!existe?.length) return;
    await queryRunner.query(
      `ALTER TABLE empresa_identidad RENAME COLUMN "${desde}" TO "${hasta}"`,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tabla = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'empresa_identidad'
    `);
    if (!tabla?.length) return;

    for (const [desde, hasta] of IdentidadEnMinusculas1790300000000.COLUMNAS) {
      await this.renombrar(queryRunner, desde, hasta);
    }

    /*
     * El indice unico apuntaba a la columna vieja; al renombrarla Postgres lo
     * sigue solo, pero se recrea por nombre para que una base que ya lo
     * hubiera perdido no se quede sin el candado de «una identidad por
     * empresa», que es lo que impide que dos empresas compartan realm.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_empresa_identidad_empresa"
        ON empresa_identidad (empresaid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [desde, hasta] of IdentidadEnMinusculas1790300000000.COLUMNAS) {
      await this.renombrar(queryRunner, hasta, desde);
    }
  }
}
