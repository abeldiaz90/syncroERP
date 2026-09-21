/**
 * ============================================================================
 * Verificación del módulo de compras tras la maduración
 * ----------------------------------------------------------------------------
 *   npm.cmd run compras:verificar
 *
 * Sólo lee. Comprueba que lo que dejaron las dos migraciones concuerde con lo
 * que el código ahora da por cierto:
 *
 *  1. La etiqueta `estado` coincide con lo que dicen los dos ejes nuevos. Si
 *     no, alguna orden quedó rotulada de una forma y se comporta de otra.
 *  2. El impuesto repartido por partida suma el de su cotización. El reparto
 *     histórico fue proporcional, así que debe cuadrar al centavo.
 *  3. Nadie pagó más de lo que recibió. Antes no se podía pagar sin recepción
 *     completa, así que no debería haber ninguno; si aparece, viene de datos
 *     cargados a mano.
 *  4. Ninguna orden viva quedó sin tasa con importe, ni al revés.
 *
 * Que no encuentre nada es el resultado esperado. Lo que encuentre lo lista
 * con su identificador para poder ir a verlo.
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

type Fila = Record<string, unknown>;

function reportar(titulo: string, filas: Fila[], explicacion: string): boolean {
  if (filas.length === 0) {
    console.log(`  ✔ ${titulo}`);
    return true;
  }
  console.log(`  ✖ ${titulo}: ${filas.length} caso(s)`);
  console.log(`    ${explicacion}`);
  for (const fila of filas.slice(0, 10)) {
    console.log(`    · ${JSON.stringify(fila)}`);
  }
  if (filas.length > 10) console.log(`    … y ${filas.length - 10} más.`);
  return false;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  let todoBien = true;
  try {
    const ds = app.get(DataSource);
    console.log('\nVerificación del módulo de compras\n');

    const [{ total }] = await ds.query(
      'SELECT COUNT(*)::int total FROM ordenes_compra',
    );
    console.log(`  ${total} orden(es) de compra en la base.\n`);

    todoBien =
      reportar(
        'La etiqueta concuerda con los dos ejes',
        await ds.query(`
          SELECT id, estado, estadorecepcion, estadopago
            FROM ordenes_compra
           WHERE estado <> CASE
                   WHEN estado = 'CANCELADA'          THEN 'CANCELADA'
                   WHEN estadopago = 'PAGADA'         THEN 'PAGADA'
                   WHEN estadopago = 'PARCIAL'        THEN 'PARCIALMENTE_PAGADA'
                   WHEN estadorecepcion = 'COMPLETA'  THEN 'RECIBIDA'
                   WHEN estadorecepcion = 'PARCIAL'   THEN 'CON_INCIDENCIAS'
                   WHEN estado = 'ENVIADA'            THEN 'ENVIADA'
                   ELSE 'PENDIENTE'
                 END
        `),
        'La orden se rotula de una forma y se comporta de otra: recibir y pagar leen los ejes.',
      ) && todoBien;

    todoBien =
      reportar(
        'El impuesto por partida suma el de su cotización',
        await ds.query(`
          SELECT c.id,
                 c.impuestototal                AS documento,
                 ROUND(SUM(d.impuestoimporte),2) AS partidas
            FROM cotizaciones c
            JOIN detalles_cotizacion d ON d.cotizacionid = c.id
           GROUP BY c.id, c.impuestototal
          HAVING ABS(c.impuestototal - SUM(d.impuestoimporte)) > 0.01
        `),
        'El reparto histórico fue proporcional; una diferencia aquí significa partidas añadidas después.',
      ) && todoBien;

    todoBien =
      reportar(
        'Nadie pagó más de lo que recibió',
        await ds.query(`
          SELECT oc.id, oc.totalpagado, ROUND(sub.recibido, 2) AS recibido
            FROM ordenes_compra oc
            JOIN (
              SELECT d.ordencompraid AS id,
                     SUM((d.subtotal + d.impuestoimporte)
                         * LEAST(d.cantidadrecibidaok, d.cantidad)
                         / NULLIF(d.cantidad, 0)) AS recibido
                FROM detalles_orden_compra d
               GROUP BY d.ordencompraid
            ) sub ON sub.id = oc.id
           WHERE oc.totalpagado - COALESCE(sub.recibido, 0) > 0.01
        `),
        'Hay dinero pagado por mercancía que no está en el almacén.',
      ) && todoBien;

    todoBien =
      reportar(
        'Tasa e importe de impuesto son coherentes entre sí',
        await ds.query(`
          SELECT id, tasaiva, subtotal, impuestoimporte
            FROM detalles_orden_compra
           WHERE (tasaiva > 0 AND impuestoimporte = 0)
              OR (tasaiva = 0 AND impuestoimporte > 0)
        `),
        'Una partida con tasa y sin importe —o al revés— descuadra la póliza de su recepción.',
      ) && todoBien;

    console.log(
      todoBien
        ? '\nTodo correcto.\n'
        : '\nHay casos que revisar antes de operar compras.\n',
    );
  } finally {
    await app.close();
  }
  if (!todoBien) process.exit(1);
}

main().catch((error) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
