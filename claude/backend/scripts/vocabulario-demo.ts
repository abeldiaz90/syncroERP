/**
 * ============================================================================
 * SyncroERP · El vocabulario exacto de esta instalación
 * ----------------------------------------------------------------------------
 * SÓLO LEE. Enseña los nombres que la carga masiva de productos exige que
 * existan —unidades de medida e impuestos se resuelven por NOMBRE y no se
 * crean al vuelo, porque los dos tienen consecuencia fiscal— más los almacenes,
 * listas de precio y cuentas de cobro con los que se va a armar la demostración.
 *
 * Escribir el Excel adivinando estos nombres es garantizar que la importación
 * los rechace renglón por renglón.
 *
 *   npx ts-node -T scripts/vocabulario-demo.ts
 * ============================================================================
 */
import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';

cargarEnv({ path: '.env.local' });
cargarEnv();

const EMPRESA = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1];
const t = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function main() {
  if (!EMPRESA) throw new Error('Falta --empresa=<UUID>.');
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? process.env.DB_DATABASE,
  });
  await ds.initialize();

  const ver = async (titulo: string, sql: string) => {
    t(titulo);
    try {
      const filas = await ds.query(sql, [EMPRESA]);
      if (!filas.length) console.log('        (nada)');
      else console.table(filas);
    } catch (e: any) {
      console.log(`        \x1b[31m${e?.message ?? e}\x1b[0m`);
    }
  };

  /*
   * `SELECT *` y no una lista de columnas escrita por mí.
   *
   * Tres intentos, tres nombres inventados: `claveunidadsat`, `tipo`, `codigo`,
   * `tipodocumento`. Este esquema mezcla `empresaid` con `empresa_id` y nombres
   * que no se deducen de la entidad, así que la lista de columnas la pone la
   * base. Son tablas de configuración: caben enteras en pantalla.
   */
  await ver('UNIDADES DE MEDIDA (el Excel las busca por nombre)',
    `SELECT * FROM unidades_medida WHERE empresaid = $1 ORDER BY 1`);
  await ver('IMPUESTOS (el Excel los busca por nombre)',
    `SELECT * FROM impuestos WHERE empresaid = $1 ORDER BY 1`);
  await ver('ALMACENES',
    `SELECT * FROM almacenes WHERE empresaid = $1 ORDER BY 1`);
  await ver('UBICACIONES DE ALMACÉN',
    `SELECT * FROM ubicaciones_almacen WHERE empresaid = $1 ORDER BY 1`);
  await ver('MATRIZ DE APROBACIONES',
    `SELECT * FROM configuraciones_aprobacion WHERE empresaid = $1 ORDER BY 1`);
  await ver('EMPLEADOS',
    `SELECT * FROM rrhh_empleados WHERE empresaid = $1 ORDER BY 1`);

  await ds.destroy();
}
main().catch((e) => { console.error(`\n\x1b[31m${e?.message ?? e}\x1b[0m`); process.exit(1); });
