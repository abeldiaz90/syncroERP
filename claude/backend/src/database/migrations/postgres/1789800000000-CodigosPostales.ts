import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Catálogo de códigos postales de México
 * ----------------------------------------------------------------------------
 * Dos tablas nuevas, nada que convertir. Una instalación que no importe el
 * catálogo se comporta exactamente como antes: el formulario de domicilio sigue
 * aceptando texto libre y el frontend recurre a la deducción por prefijo.
 *
 * Los nombres van en minúsculas sin comillas porque esa es la convención física
 * del esquema (ver `LowercaseNamingStrategy`): PostgreSQL pliega a minúsculas
 * lo que no va entrecomillado, y el ERP tiene consultas históricas en camelCase
 * sin comillas que solo funcionan gracias a ese plegado.
 *
 * El único índice que no es de conveniencia es `UX_codigos_postales_asentamiento`:
 * impide que el mismo código postal cargue dos veces la misma colonia. Sin él,
 * una reimportación parcial llenaría el desplegable de colonias con duplicados
 * y el usuario no tendría forma de saber cuál elegir.
 * ============================================================================
 */
export class CodigosPostales1789800000000 implements MigrationInterface {
  name = 'CodigosPostales1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS codigos_postales (
        id                 uuid NOT NULL DEFAULT gen_random_uuid(),
        cp                 varchar(5)   NOT NULL,
        estadoclave        varchar(5)   NOT NULL,
        estadonombre       varchar(120) NOT NULL,
        municipioclave     varchar(5),
        municipionombre    varchar(160) NOT NULL,
        ciudad             varchar(160),
        colonia            varchar(200) NOT NULL,
        colonianormalizada varchar(200) NOT NULL,
        tipoasentamiento   varchar(80),
        fuente             varchar(20)  NOT NULL DEFAULT 'SEPOMEX',
        version            varchar(40)  NOT NULL,
        activo             boolean      NOT NULL DEFAULT true,
        CONSTRAINT "PK_codigos_postales" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IX_codigos_postales_cp"
        ON codigos_postales (cp)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IX_codigos_postales_estado"
        ON codigos_postales (estadoclave)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IX_codigos_postales_municipio"
        ON codigos_postales (estadoclave, municipionombre)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_codigos_postales_asentamiento"
        ON codigos_postales (cp, colonianormalizada)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS codigos_postales_cargas (
        id          uuid NOT NULL DEFAULT gen_random_uuid(),
        fuente      varchar(20)  NOT NULL,
        archivo     varchar(260) NOT NULL,
        sha256      varchar(64)  NOT NULL,
        version     varchar(40)  NOT NULL,
        filas       integer      NOT NULL DEFAULT 0,
        cargadoen   timestamptz  NOT NULL DEFAULT now(),
        cargadopor  varchar(150),
        notas       varchar(400),
        CONSTRAINT "PK_codigos_postales_cargas" PRIMARY KEY (id)
      )
    `);

    /*
     * La huella es única porque es el mecanismo que evita la reimportación
     * accidental. Si se pudiera repetir, «cargar una sola vez» dependería de
     * que nadie vuelva a correr el comando, y eso no es una garantía.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UX_codigos_postales_cargas_huella"
        ON codigos_postales_cargas (sha256)
    `);

    await queryRunner.query(`
      ALTER TABLE codigos_postales_cargas
        DROP CONSTRAINT IF EXISTS "CK_codigos_postales_cargas_fuente"
    `);
    await queryRunner.query(`
      ALTER TABLE codigos_postales_cargas
        ADD CONSTRAINT "CK_codigos_postales_cargas_fuente"
        CHECK (fuente IN ('SEPOMEX', 'SAT', 'MANUAL'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS codigos_postales_cargas`);
    await queryRunner.query(`DROP TABLE IF EXISTS codigos_postales`);
  }
}
