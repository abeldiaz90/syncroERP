import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * Recibir dos veces lo mismo
 * ----------------------------------------------------------------------------
 * `recibir()` exige clave de idempotencia y la comprueba con un SELECT antes de
 * insertar. Eso sirve contra el reintento —el usuario que vuelve a pulsar
 * medio minuto después— y NO sirve contra el doble clic: dos peticiones
 * simultáneas con la misma clave hacen su SELECT a la vez, las dos no
 * encuentran nada, y las dos insertan. La mercancía entra dos veces al
 * almacén, con sus dos asientos.
 *
 * El pago al mismo proveedor sí estaba protegido —`pagos_proveedor` tiene su
 * índice único desde que se creó— y la recepción no. Misma comprobación, misma
 * forma, y una con red debajo y la otra sin ella.
 *
 * Un `if` no puede cerrar esa ventana: entre la lectura y la escritura hay otra
 * transacción. Sólo la base de datos puede, y por eso el índice.
 *
 * PARCIAL, como el de pagos: las recepciones viejas se guardaron sin clave y
 * `NULL` no colisiona con nada en Postgres, pero un índice total obligaría a
 * inventarles una. Se protege lo que viene, sin tocar lo que hay.
 *
 * Si ya existieran duplicados, el índice no se podría crear. Se comprueba antes
 * y se dice cuáles son, en vez de reventar con «duplicate key» y dejar la
 * instalación a medio migrar.
 * ============================================================================
 */
export class RecibirDosVecesLoMismo1790520000000 implements MigrationInterface {
  name = 'RecibirDosVecesLoMismo1790520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicados: Array<{ ordencompraid: string; claveidempotencia: string; cuantas: string }> =
      await queryRunner.query(`
        SELECT ordencompraid, claveidempotencia, COUNT(*) cuantas
          FROM recepciones_compra
         WHERE claveidempotencia IS NOT NULL
         GROUP BY empresaid, ordencompraid, claveidempotencia
        HAVING COUNT(*) > 1
      `);

    if (duplicados.length) {
      /*
       * No se borra nada: una recepción duplicada ya movió inventario y ya
       * generó su asiento, así que deshacerla es una decisión contable, no de
       * una migración. Se dice cuáles son y se para.
       */
      const lista = duplicados
        .map((d) => `orden ${d.ordencompraid} · clave ${d.claveidempotencia} (${d.cuantas} veces)`)
        .join('; ');
      throw new Error(
        `Hay recepciones repetidas con la misma clave de idempotencia y por eso no se puede ` +
          `crear el índice que lo impide: ${lista}. Cada una movió inventario y generó su ` +
          `asiento, así que deshacerlas es una decisión contable y no la toma una migración.`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_recepciones_compra_idempotencia
        ON recepciones_compra (empresaid, ordencompraid, claveidempotencia)
        WHERE claveidempotencia IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ux_recepciones_compra_idempotencia`);
  }
}
