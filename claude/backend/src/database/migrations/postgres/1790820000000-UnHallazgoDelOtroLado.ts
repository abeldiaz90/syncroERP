import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Un hallazgo del otro lado no tiene identificador del ERP
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * `integracion_discrepancias.entidadid` es `uuid`, porque hasta hoy todo lo que
 * esa tabla reportaba era una entidad DEL ERP: un cliente, un crédito, un pago.
 *
 * La conciliación de cartera recorría únicamente los clientes vinculados, así
 * que un cliente creado directamente en el registro externo no entraba en
 * ningún bucle, no generaba discrepancia, y la empresa podía promoverse con el
 * informe «sin discrepancias abiertas» mientras allá había cartera que el ERP
 * no sabía que existía.
 *
 * Al cerrar ese agujero aparece un hallazgo que NO tiene identificador del ERP
 * —ésa es justamente la noticia— y cuyo único identificador es el del core, que
 * en Fineract es un entero: `5`, no un uuid. Guardarlo en una columna `uuid`
 * aborta la transacción con «invalid input syntax for type uuid», y el error no
 * se ve al compilar.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 * Convierte la columna a `varchar(64)`. Un uuid cabe en 36 caracteres, así que
 * las filas existentes pasan tal cual con un `USING entidadid::text` y nada que
 * las lea cambia: la comparación se hacía en JavaScript, no en SQL.
 *
 * La alternativa habría sido fabricar un uuid a partir del id externo para que
 * entrara en la columna. Eso es exactamente lo que este proyecto no hace: un
 * identificador inventado se guarda igual de bien y luego no corresponde a
 * nada.
 * ============================================================================
 */
export class UnHallazgoDelOtroLado1790820000000 implements MigrationInterface {
  name = 'UnHallazgoDelOtroLado1790820000000';

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const [fila] = await q.query(`SELECT to_regclass($1) AS tabla`, [tabla]);
    return Boolean(fila?.tabla);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'integracion_discrepancias'))) return;

    const [columna] = await queryRunner.query(
      `SELECT data_type AS tipo
         FROM information_schema.columns
        WHERE table_name = 'integracion_discrepancias'
          AND column_name = 'entidadid'`,
    );
    /* Si ya es texto, no hay nada que hacer: la migración es reejecutable. */
    if (!columna || String(columna.tipo).toLowerCase() !== 'uuid') return;

    await queryRunner.query(`
      ALTER TABLE integracion_discrepancias
      ALTER COLUMN entidadid TYPE varchar(64) USING entidadid::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.existe(queryRunner, 'integracion_discrepancias'))) return;

    /*
     * Volver a `uuid` sólo se puede si TODAS las filas lo son. Si hay hallazgos
     * del otro lado —ids del core, que no son uuid— se convertirían en un error
     * a mitad del ALTER y la tabla quedaría a medias. Se borran primero esos
     * hallazgos, que es lo único que sobra para volver al esquema anterior, y
     * se dice en el detalle de los demás que se hizo.
     */
    await queryRunner.query(`
      DELETE FROM integracion_discrepancias
       WHERE entidadid IS NOT NULL
         AND entidadid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    `);
    await queryRunner.query(`
      ALTER TABLE integracion_discrepancias
      ALTER COLUMN entidadid TYPE uuid USING entidadid::uuid
    `);
  }
}
