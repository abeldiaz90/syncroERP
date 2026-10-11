import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La dimensión que le faltaba al mayor
 * ----------------------------------------------------------------------------
 * `partidas_poliza` tenía cuenta, cargo y abono. Con eso se puede contestar
 * «cuánto gasté en papelería» y no «cuánto costó el hotel contra cuánto costó
 * la ferretería». Esta migración añade el catálogo de centros de costo y la
 * columna en la partida.
 *
 * LAS FILAS QUE YA EXISTEN
 *
 * `centrocostoid` queda en NULL, y NULL significa **no se sabe**, no «sin
 * centro». Las pólizas de antes de hoy no tienen a qué centro pertenecían y
 * nadie puede saberlo retroactivamente: repartirlas por una regla inventada
 * daría un reporte por centro de aspecto correcto construido sobre adivinanzas,
 * que es peor que un reporte que dice «esto no estaba clasificado».
 *
 * Por eso el reporte por centro agrupa lo no clasificado en su propio renglón
 * en vez de esconderlo o repartirlo.
 *
 * REVERSIBLE
 *
 * `down` quita la columna y la tabla. La columna es nueva y nadie depende de
 * ella todavía; el catálogo se pierde, que es lo que significa revertir.
 * ============================================================================
 */
export class LaDimensionQueLeFaltabaAlMayor1790880000000
  implements MigrationInterface
{
  name = 'LaDimensionQueLeFaltabaAlMayor1790880000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS centros_costo (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        empresaid uuid NOT NULL,
        codigo varchar(30) NOT NULL,
        nombre varchar(120) NOT NULL,
        tipo varchar(20) NOT NULL DEFAULT 'DEPARTAMENTO',
        padreid uuid NULL,
        aceptamovimientos boolean NOT NULL DEFAULT true,
        activo boolean NOT NULL DEFAULT true,
        oficinaexternaid varchar(40) NULL,
        descripcion varchar(255) NULL,
        fechacreacion TIMESTAMP NOT NULL DEFAULT now(),
        fechaactualizacion TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_centros_costo" PRIMARY KEY (id)
      )
    `);

    /*
     * El código es la llave con la que la gente lo nombra, y tiene que ser
     * único DENTRO de la empresa: dos empresas distintas pueden llamar «01» a
     * cosas distintas, y de hecho lo harán.
     */
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UX_centros_costo_empresa_codigo"
         ON centros_costo (empresaid, codigo)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_centros_costo_empresa_activo"
         ON centros_costo (empresaid, activo)`,
    );
    /* El árbol se recorre por el padre; sin esto, cada expansión es un barrido. */
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_centros_costo_padre" ON centros_costo (padreid)`,
    );

    await q.query(
      `ALTER TABLE partidas_poliza ADD COLUMN IF NOT EXISTS centrocostoid uuid NULL`,
    );
    /*
     * Por aquí entra TODO reporte por centro: agrupar el mayor de un ejercicio
     * sin este índice es un barrido secuencial de la tabla más grande del
     * sistema. Es la misma lección de los 143 índices que nunca se pusieron.
     */
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IX_partidas_poliza_centro"
         ON partidas_poliza (centrocostoid)`,
    );
    /*
     * Y la llave foránea, que aquí sí vale la pena: un centro borrado dejaría
     * partidas apuntando a nada y el reporte por centro perdería dinero sin
     * decirlo. RESTRICT obliga a desactivar en vez de borrar, que es lo que se
     * quiere con un catálogo contable.
     */
    await q.query(`
      DO $$ BEGIN
        ALTER TABLE partidas_poliza
          ADD CONSTRAINT "FK_partidas_poliza_centro"
          FOREIGN KEY (centrocostoid) REFERENCES centros_costo(id) ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE partidas_poliza DROP CONSTRAINT IF EXISTS "FK_partidas_poliza_centro"`,
    );
    await q.query(`DROP INDEX IF EXISTS "IX_partidas_poliza_centro"`);
    await q.query(
      `ALTER TABLE partidas_poliza DROP COLUMN IF EXISTS centrocostoid`,
    );
    await q.query(`DROP TABLE IF EXISTS centros_costo`);
  }
}
