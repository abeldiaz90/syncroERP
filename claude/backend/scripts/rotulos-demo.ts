/**
 * ============================================================================
 * SyncroERP · Quitar los rótulos de prueba antes de enseñar el sistema
 * ----------------------------------------------------------------------------
 * NO borra ni crea nada: sólo RENOMBRA, y desactiva dos cuentas de banco que
 * sobran. Toda la configuración —identificadores, mapeos, saldos— queda igual.
 *
 * Por qué hace falta: el borrado de operación dejó la base limpia de datos,
 * pero los nombres son configuración y sobrevivieron. Medido el 30-sep-2026,
 * esto es lo que un cliente vería en pantalla:
 *
 *   · La lista de precios POR DEFECTO se llama «PRUEBA POS CODEX» — y es la
 *     que aparece en el punto de venta, arriba, en cada ticket.
 *   · El almacén principal, «PRUEBA POS SIN INVENTARIO REAL».
 *   · Las cuentas de cobro, «CUENTA SINTETICA SIN DINERO REAL» y
 *     «PRUEBA POS SIN DINERO REAL».
 *   · Y una empleada de nómina apellidada «Prueba».
 *
 * Ninguno es un defecto del sistema. Todos son el rastro de haberlo probado
 * bien, y ninguno debería estar en pantalla mañana.
 *
 *   npx ts-node -T scripts/rotulos-demo.ts --empresa=<UUID>              (ensayo)
 *   npx ts-node -T scripts/rotulos-demo.ts --empresa=<UUID> --execute
 * ============================================================================
 */
import { config as cargarEnv } from 'dotenv';
import { DataSource } from 'typeorm';

cargarEnv({ path: '.env.local' });
cargarEnv();

const EMPRESA = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1];
const EJECUTAR = process.argv.includes('--execute');
const t = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);

/** [tabla, columna a comparar, valor viejo, columna a escribir, valor nuevo] */
const CAMBIOS: { tabla: string; donde: string; viejo: string; campo: string; nuevo: string; porque: string }[] = [
  { tabla: 'listas_precio', donde: 'nombre', viejo: 'PRUEBA POS CODEX',
    campo: 'nombre', nuevo: 'Lista de mostrador',
    porque: 'es la lista POR DEFECTO: sale en el punto de venta y en cada ticket' },
  { tabla: 'listas_precio', donde: 'nombre', viejo: 'UAT COMPRAS · Lista margen',
    campo: 'nombre', nuevo: 'Lista mayoreo (costo + 35%)',
    porque: 'aparece en el selector de listas' },
  { tabla: 'almacenes', donde: 'nombre', viejo: 'PRUEBA POS SIN INVENTARIO REAL',
    campo: 'nombre', nuevo: 'Almacén Central',
    porque: 'es el almacén de la caja y sale en toda la pantalla de inventario' },
  { tabla: 'cuentas_bancarias', donde: 'nombre', viejo: 'Caja mostrador (UAT)',
    campo: 'nombre', nuevo: 'Caja mostrador',
    porque: 'es la caja por defecto de todo cobro de contado' },
  { tabla: 'cuentas_bancarias', donde: 'nombre', viejo: 'CUENTA SINTETICA SIN DINERO REAL',
    campo: 'nombre', nuevo: 'BBVA · Cuenta operativa',
    porque: 'sale en tesorería y en el cobro por transferencia' },
  { tabla: 'rrhh_empleados', donde: 'apellidomaterno', viejo: 'Prueba',
    campo: 'apellidomaterno', nuevo: 'Vega',
    porque: 'el recibo de nómina lleva el nombre completo impreso' },
];

/** La cuenta que sobra: no se borra —tiene historia— se apaga. */
const APAGAR = ['PRUEBA POS SIN DINERO REAL'];

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
  const qr = ds.createQueryRunner();
  await qr.connect();

  t(`RÓTULOS · ${EJECUTAR ? '\x1b[31mCAMBIO REAL\x1b[0m' : 'sólo enseñar'}`);
  const pendientes: typeof CAMBIOS = [];
  for (const c of CAMBIOS) {
    const hay = await qr.query(
      `SELECT COUNT(*)::int AS n FROM "${c.tabla}" WHERE empresaid = $1 AND "${c.donde}" = $2`,
      [EMPRESA, c.viejo],
    );
    const n = Number(hay[0]?.n ?? 0);
    console.log(
      `  ${n ? '·' : '✓'} ${c.tabla}: «${c.viejo}» → «${c.nuevo}»` +
        (n ? '' : '  (ya no está)'),
    );
    if (n) { nota(c.porque); pendientes.push(c); }
  }

  t('CUENTAS QUE SE APAGAN (no se borran)');
  for (const nombre of APAGAR) console.log(`  · ${nombre}`);

  if (!EJECUTAR) {
    t('No se cambió nada');
    nota('Repite con --execute para aplicarlo.');
    await qr.release(); await ds.destroy(); return;
  }

  await qr.startTransaction();
  try {
    for (const c of pendientes) {
      await qr.query(
        `UPDATE "${c.tabla}" SET "${c.campo}" = $3 WHERE empresaid = $1 AND "${c.donde}" = $2`,
        [EMPRESA, c.viejo, c.nuevo],
      );
    }
    for (const nombre of APAGAR) {
      await qr.query(
        `UPDATE cuentas_bancarias SET activo = false WHERE empresaid = $1 AND nombre = $2`,
        [EMPRESA, nombre],
      );
    }
    await qr.commitTransaction();
    t('LISTO');
    nota('Nada se borró: sólo cambiaron los rótulos.');
  } catch (e) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release(); await ds.destroy();
  }
}
main().catch((e) => { console.error(`\n\x1b[31m${e?.message ?? e}\x1b[0m`); process.exit(1); });
