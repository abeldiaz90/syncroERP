import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * La orden de compra tiene DOS vidas, no una
 * ----------------------------------------------------------------------------
 * `estado` mezclaba dos cosas que avanzan por separado: cuánto ha llegado y
 * cuánto se ha pagado. Con un solo campo, `PARCIALMENTE_PAGADA` borraba
 * `CON_INCIDENCIAS`, y entonces:
 *
 *  · una orden que recibió 8 de 10 piezas no se podía pagar, porque pagar
 *    exigía estar `RECIBIDA`. El proveedor entregaba, facturaba, y el sistema
 *    no tenía manera de registrar que se le debía;
 *  · y si se hubiera podido pagar, al guardarse `PARCIALMENTE_PAGADA` ya no se
 *    podían recibir las 2 piezas que faltaban, porque recibir exigía estar
 *    `ENVIADA` o `CON_INCIDENCIAS`.
 *
 * Es decir: el documento quedaba en un callejón sin salida en cuanto una
 * entrega llegaba incompleta, que en compras es la mitad de las veces.
 *
 * Se separan los dos ejes y `estado` se conserva DERIVADO, para no romper las
 * pantallas ni los reportes que ya lo leen. Nadie escribe `estado` a mano: se
 * recalcula de los dos campos nuevos.
 * ============================================================================
 */
export class EstadosSeparadosOrdenCompra1790000100000
  implements MigrationInterface
{
  name = 'EstadosSeparadosOrdenCompra1790000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ordenes_compra
        ADD COLUMN IF NOT EXISTS estadorecepcion varchar(20) NOT NULL DEFAULT 'PENDIENTE',
        ADD COLUMN IF NOT EXISTS estadopago      varchar(20) NOT NULL DEFAULT 'PENDIENTE'
    `);

    /*
     * La recepción se deduce de las partidas y no del estado: es el dato duro.
     * Una orden sin partidas recibidas queda PENDIENTE aunque su estado dijera
     * otra cosa.
     */
    await queryRunner.query(`
      UPDATE ordenes_compra oc
         SET estadorecepcion = sub.estado
        FROM (
          SELECT d.ordencompraid AS id,
                 CASE
                   WHEN SUM(d.cantidadrecibidaok) <= 0 THEN 'PENDIENTE'
                   WHEN BOOL_AND(d.cantidadrecibidaok >= d.cantidad) THEN 'COMPLETA'
                   ELSE 'PARCIAL'
                 END AS estado
            FROM detalles_orden_compra d
           GROUP BY d.ordencompraid
        ) sub
       WHERE sub.id = oc.id
    `);

    await queryRunner.query(`
      UPDATE ordenes_compra
         SET estadopago = CASE
               WHEN totalpagado <= 0 THEN 'PENDIENTE'
               WHEN totalpagado >= total - 0.009 THEN 'PAGADA'
               ELSE 'PARCIAL'
             END
    `);

    await queryRunner.query(`
      ALTER TABLE ordenes_compra
        ADD CONSTRAINT CK_orden_compra_estado_recepcion
          CHECK (estadorecepcion IN ('PENDIENTE','PARCIAL','COMPLETA')),
        ADD CONSTRAINT CK_orden_compra_estado_pago
          CHECK (estadopago IN ('PENDIENTE','PARCIAL','PAGADA'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ordenes_compra
        DROP CONSTRAINT IF EXISTS CK_orden_compra_estado_recepcion,
        DROP CONSTRAINT IF EXISTS CK_orden_compra_estado_pago
    `);
    await queryRunner.query(`
      ALTER TABLE ordenes_compra
        DROP COLUMN IF EXISTS estadorecepcion,
        DROP COLUMN IF EXISTS estadopago
    `);
  }
}
