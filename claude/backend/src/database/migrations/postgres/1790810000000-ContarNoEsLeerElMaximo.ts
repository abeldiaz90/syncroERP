import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Contar no es leer el máximo y sumarle uno
 * ----------------------------------------------------------------------------
 * QUÉ PASABA
 *
 * Cuatro documentos se numeraban con un `SELECT MAX(...) + 1`: la oportunidad
 * de CRM (`OPP-`), el activo fijo (`AF-`), la devolución a proveedor (`DP-`) y
 * el movimiento de tesorería (`TM-`).
 *
 * Entre leer el máximo y escribir la fila hay una ventana. Dos altas
 * simultáneas leen el mismo máximo y se llevan el mismo número. No se nota en
 * pruebas —hace falta que dos personas guarden en el mismo instante— y se nota
 * el día que una sucursal entera captura a la vez.
 *
 * Lo que decide la gravedad es si la base lo impide:
 *
 *   · `activos_fijos` YA tenía índice único sobre (empresaid, codigo). Ahí la
 *     carrera da un error 500: feo, pero ruidoso.
 *   · `crm_oportunidades`, `devoluciones_proveedor` y `tesoreria_movimientos`
 *     NO lo tenían. Ahí la carrera no da error: **da dos documentos con el
 *     mismo folio, en silencio**. Dos movimientos de dinero con el mismo
 *     número y una conciliación que no cuadra sin que nadie sepa por qué; dos
 *     devoluciones con el mismo número, cada una con su asiento, y una nota de
 *     crédito del proveedor que ya no se sabe a cuál corresponde.
 *
 * QUÉ HACE ESTA MIGRACIÓN
 *
 *   · **Siembra** `folio_secuencias` con el consecutivo más alto que ya tiene
 *     cada empresa en cada serie. Sin esto, la primera alta pediría el 1 y
 *     chocaría contra un folio existente.
 *   · **Añade el índice único** que faltaba en las tres tablas. Es el cierre de
 *     fondo: el servicio ya no produce duplicados, y si algún día otro camino
 *     lo intentara, la base se niega.
 *
 * SI YA HAY DUPLICADOS, SE PLANTA
 *
 * Crear el índice fallaría con un error de PostgreSQL que no dice cuáles son.
 * Así que se buscan primero y, si los hay, la migración aborta nombrándolos y
 * diciendo qué hacer. Es deliberado: continuar en silencio dejaría la tabla sin
 * la única garantía que impide que el problema se repita, y nadie se enteraría
 * hasta la siguiente conciliación que no cuadre.
 *
 * El formato de los cuatro folios NO cambia. Están impresos y referidos así, y
 * lo que estaba roto no era la forma: era la cuenta.
 * ============================================================================
 */
export class ContarNoEsLeerElMaximo1790810000000 implements MigrationInterface {
  name = 'ContarNoEsLeerElMaximo1790810000000';

  /**
   * Cada serie: su tabla, su columna, su prefijo y cuántos caracteres ocupa
   * ese prefijo con el guion (de ahí arranca el número).
   */
  private readonly SERIES = [
    { tabla: 'crm_oportunidades', columna: 'folio', tipo: 'OPP', desde: 5 },
    { tabla: 'activos_fijos', columna: 'codigo', tipo: 'AF', desde: 4 },
    { tabla: 'devoluciones_proveedor', columna: 'folio', tipo: 'DP', desde: 4 },
    { tabla: 'tesoreria_movimientos', columna: 'folio', tipo: 'TM', desde: 4 },
  ];

  /** Dónde falta el índice único. `activos_fijos` ya lo traía. */
  private readonly SIN_INDICE = [
    'crm_oportunidades',
    'devoluciones_proveedor',
    'tesoreria_movimientos',
  ];

  private async existe(q: QueryRunner, tabla: string): Promise<boolean> {
    const [fila] = await q.query(`SELECT to_regclass($1) AS tabla`, [tabla]);
    return Boolean(fila?.tabla);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * `folio_secuencias` la crea la migración de los folios de compras. Si por
     * lo que sea no está, se crea aquí: una instalación a la que le falte no
     * puede numerar nada, y es peor plantarse que crear una tabla vacía.
     */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS folio_secuencias (
        empresaid uuid NOT NULL,
        tipo varchar(16) NOT NULL,
        anio int NOT NULL,
        ultimo int NOT NULL DEFAULT 0,
        CONSTRAINT "PK_folio_secuencias" PRIMARY KEY (empresaid, tipo, anio)
      )
    `);

    for (const { tabla, columna, tipo, desde } of this.SERIES) {
      if (!(await this.existe(queryRunner, tabla))) continue;

      /* Sólo las filas con la forma esperada: una rota no puede marcar el tope. */
      const soloBienFormados = `${columna} ~ '^${tipo}-[0-9]{1,12}$'`;
      const numero = `CAST(SUBSTRING(${columna}, ${desde}, 12) AS BIGINT)`;

      if (this.SIN_INDICE.includes(tabla)) {
        const duplicados: { empresaid: string; folio: string; cuantos: string }[] =
          await queryRunner.query(`
            SELECT empresaid, ${columna} AS folio, COUNT(*)::text AS cuantos
            FROM ${tabla}
            WHERE ${columna} IS NOT NULL
            GROUP BY empresaid, ${columna}
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
            LIMIT 20
          `);

        if (duplicados.length > 0) {
          const lista = duplicados
            .map((d) => `${d.folio} (${d.cuantos} veces)`)
            .join(', ');
          throw new Error(
            `No se puede poner el índice único de ${tabla}: ya hay folios repetidos. ` +
              `${lista}. Son documentos distintos con el mismo número, muy ` +
              `probablemente de dos altas simultáneas. Renumera los repetidos a ` +
              `mano —conservando el más antiguo— y vuelve a correr la migración. ` +
              `Esta migración NO sigue adelante a propósito: sin el índice, el ` +
              `problema puede repetirse y nadie se enteraría.`,
          );
        }
      }

      /* La semilla: el consecutivo más alto ya usado por cada empresa. */
      /*
       * ======================================================================
       * El `::uuid` no es decorativo
       * ----------------------------------------------------------------------
       * `folio_secuencias.empresaid` es `uuid`, y de las cuatro tablas tres
       * guardan la empresa como `uuid`… pero `devoluciones_proveedor` la
       * guarda como `varchar(36)`. Sin el casteo, PostgreSQL aborta con
       *
       *     column "empresaid" is of type uuid but expression is of type
       *     character varying
       *
       * y la migración entera revierte. Pasó la primera vez que se corrió,
       * sobre la base de Abel.
       *
       * El casteo vale para los dos casos —un `uuid::uuid` no hace nada— así
       * que esto deja de depender de qué tipo eligió cada tabla. Que una de
       * las cuatro tenga la empresa en varchar es una incoherencia del esquema
       * que conviene mirar aparte: ahí cabe un identificador que no es un uuid
       * y que ninguna otra tabla aceptaría.
       * ======================================================================
       */
      await queryRunner.query(`
        INSERT INTO folio_secuencias (empresaid, tipo, anio, ultimo)
        SELECT empresaid::uuid, '${tipo}', 0, MAX(${numero})::int
        FROM ${tabla}
        WHERE ${soloBienFormados}
        GROUP BY empresaid
        ON CONFLICT (empresaid, tipo, anio)
        DO UPDATE SET ultimo = GREATEST(folio_secuencias.ultimo, EXCLUDED.ultimo)
      `);
    }

    for (const tabla of this.SIN_INDICE) {
      if (!(await this.existe(queryRunner, tabla))) continue;
      const columna = this.SERIES.find((s) => s.tabla === tabla)!.columna;
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_${tabla}_${columna}"
        ON ${tabla} (empresaid, ${columna}) WHERE ${columna} IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of this.SIN_INDICE) {
      if (!(await this.existe(queryRunner, tabla))) continue;
      const columna = this.SERIES.find((s) => s.tabla === tabla)!.columna;
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${tabla}_${columna}"`);
    }
    /*
     * Las semillas se quedan. Borrarlas devolvería las series al 1 y la
     * siguiente alta chocaría contra folios existentes: deshacer el índice no
     * puede dejar la numeración peor de lo que estaba.
     */
  }
}
