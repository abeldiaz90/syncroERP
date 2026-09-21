import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ============================================================================
 * El impuesto viaja con la partida, no como un total suelto
 * ----------------------------------------------------------------------------
 * Hasta ahora el IVA de una compra existía en un solo lugar: `impuestoTotal`
 * de la cotización, un número que el cliente mandaba por su cuenta. De ahí
 * salían dos caminos que nunca se volvían a encontrar:
 *
 *  · Al RECIBIR, la póliza calculaba el IVA con la tasa que el producto
 *    tuviera ESE DÍA en el catálogo.
 *  · Al PAGAR, la reclasificación de IVA acreditable usaba el `impuestoTotal`
 *    de la cotización, capturado meses antes.
 *
 * Si alguien cambiaba la tasa de un producto entre la cotización y el pago
 * —o si el total tecleado nunca correspondió con los productos— la cuenta de
 * IVA pendiente de pago no volvía a cero jamás. Y no lo dice nadie: cuadra
 * contra sí misma, acumulando un residuo que sólo aparece al cierre del
 * ejercicio.
 *
 * Con la tasa y el importe guardados por partida, los dos momentos leen el
 * mismo número, el que se pactó. Las filas históricas se rellenan repartiendo
 * el impuesto total de su cotización en proporción al subtotal de cada
 * partida: no es lo que se capturó —eso se perdió— pero suma exactamente lo
 * mismo, que es lo que la contabilidad necesita.
 * ============================================================================
 */
export class ImpuestoPorPartidaCompras1790000000000
  implements MigrationInterface
{
  name = 'ImpuestoPorPartidaCompras1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['detalles_cotizacion', 'detalles_orden_compra']) {
      await queryRunner.query(`
        ALTER TABLE ${tabla}
          ADD COLUMN IF NOT EXISTS tasaiva         decimal(7,4)  NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS impuestoimporte decimal(18,4) NOT NULL DEFAULT 0
      `);
    }

    /*
     * Reparto proporcional del impuesto histórico. `NULLIF` evita dividir
     * entre cero en cotizaciones cuyo subtotal quedó en cero: esas se quedan
     * en impuesto cero, que es lo correcto.
     */
    await queryRunner.query(`
      UPDATE detalles_cotizacion d
         SET impuestoimporte = ROUND(
               c.impuestototal * (d.subtotal / NULLIF(c.subtotal, 0)), 4)
        FROM cotizaciones c
       WHERE c.id = d.cotizacionid
         AND c.impuestototal > 0
         AND c.subtotal > 0
    `);
    await queryRunner.query(`
      UPDATE detalles_cotizacion
         SET tasaiva = ROUND(impuestoimporte / NULLIF(subtotal, 0), 4)
       WHERE subtotal > 0 AND impuestoimporte > 0
    `);

    /*
     * La orden hereda de la cotización que la originó, emparejando por
     * producto. Es la misma correspondencia que usa `crearDesdeCotizacion`.
     */
    await queryRunner.query(`
      UPDATE detalles_orden_compra doc
         SET tasaiva = dc.tasaiva,
             impuestoimporte = ROUND(
               dc.tasaiva * doc.subtotal, 4)
        FROM ordenes_compra oc
        JOIN detalles_cotizacion dc ON dc.cotizacionid = oc.cotizacionid
       WHERE doc.ordencompraid = oc.id
         AND dc.productoid = doc.productoid
         AND dc.tasaiva > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ['detalles_cotizacion', 'detalles_orden_compra']) {
      await queryRunner.query(`
        ALTER TABLE ${tabla}
          DROP COLUMN IF EXISTS tasaiva,
          DROP COLUMN IF EXISTS impuestoimporte
      `);
    }
  }
}
