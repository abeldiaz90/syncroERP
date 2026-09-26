import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Folios de tesorería irrepetibles
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * `siguienteFolio` calculaba el consecutivo así:
 *
 *   MAX(CAST(SUBSTRING(folio, 4, 12) AS BIGINT))  →  (maximo ?? 0) + 1
 *
 * `node-postgres` devuelve BIGINT como STRING —no cabe en un `number` de
 * JavaScript— y en JavaScript `'1' + 1` no es 2: es `'11'`. La progresión se
 * dispara y termina clavada en un punto fijo:
 *
 *   TM-00000001 → '1'+1='11'   → TM-00000011
 *   TM-00000011 → '11'+1='111' → TM-00000111
 *   …
 *   TM-1111111111111 → el MISMO, para siempre
 *
 * Medido el 26-sep-2026: los doce movimientos de una cuenta tenían el mismo
 * folio, y el reporte de conciliación los listaba como doce renglones con el
 * mismo número de documento. Un folio que no identifica nada no es un folio.
 *
 * El código ya está corregido —`Number(...)` antes de sumar—. Esta migración
 * repara lo que quedó escrito y cierra la puerta.
 *
 * POR QUÉ SE RENUMERA TODO Y NO SÓLO LO ROTO
 *
 * Porque numerar sólo lo roto obliga a elegir entre dejar huecos o chocar con
 * los folios buenos. Se renumera la serie completa por empresa en orden
 * cronológico —fecha, y a igualdad de fecha el orden en que se escribieron—,
 * que es el orden en que un consecutivo debería haber nacido.
 *
 * Esto se puede hacer porque `TM-` es un folio INTERNO de control: no es un
 * folio fiscal, no viaja en ningún CFDI y no lo conoce ningún tercero. Nada
 * externo apunta a él —las conciliaciones enlazan por `id`, no por folio—, así
 * que renumerar no rompe ninguna referencia. Si algún día el folio pasara a ser
 * un dato que alguien de fuera conoce, esta migración ya no sería legítima.
 *
 * Y EL ÍNDICE ÚNICO
 *
 * Lo que garantiza que no vuelva a ocurrir no es el arreglo del código: es la
 * base. Con el índice, un generador roto falla al insertar en vez de escribir
 * doce veces el mismo número y dejar que nadie se entere.
 * ============================================================================
 */
export class FoliosDeTesoreriaIrrepetibles1790470000000
  implements MigrationInterface
{
  name = 'FoliosDeTesoreriaIrrepetibles1790470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existe = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = 'tesoreria_movimientos'
    `);
    if (!existe?.length) return;

    /*
     * Se renumera sobre una tabla temporal y en un solo UPDATE: hacerlo fila a
     * fila con el índice único ya puesto chocaría consigo mismo a mitad del
     * camino.
     */
    await queryRunner.query(`
      WITH ordenados AS (
        SELECT id,
               'TM-' || LPAD(
                 ROW_NUMBER() OVER (
                   PARTITION BY empresaid
                   ORDER BY fecha ASC, fechacreacion ASC, id ASC
                 )::text, 8, '0') AS folionuevo
          FROM tesoreria_movimientos
      )
      UPDATE tesoreria_movimientos m
         SET folio = o.folionuevo
        FROM ordenados o
       WHERE o.id = m.id
         AND m.folio IS DISTINCT FROM o.folionuevo
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_tesoreria_movimiento_folio
        ON tesoreria_movimientos (empresaid, folio)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Sólo se retira el índice. Los folios NO se devuelven a su estado
     * anterior: el estado anterior era una serie con doce documentos que
     * compartían número, y volver a él no repara nada.
     */
    await queryRunner.query(
      'DROP INDEX IF EXISTS UQ_tesoreria_movimiento_folio',
    );
  }
}
