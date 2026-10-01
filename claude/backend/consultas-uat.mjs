/**
 * Consultas de SOLO LECTURA para la verificación del UAT.
 * No escribe nada. Usa el .env del backend; las credenciales nunca salen de aquí.
 *   node consultas-uat.mjs
 */
import * as dotenv from 'dotenv';
import pg from 'pg';

// Igual que `src/database/data-source.ts`: `.env` primero y `.env.local`
// encima, que es donde vive de verdad la conexión a PostgreSQL.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const cliente = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const consultas = [
  ['1 · Existencias del Termo (INV-001) por almacén', `
    SELECT a.nombre AS almacen, s.cantidad, s.reservado, s.bloqueado, s.entransito
    FROM stock_por_almacen s
    JOIN productos p ON p.id = s.productoid
    JOIN almacenes a ON a.id = s.almacenid
    WHERE p.sku = 'INV-001'
    ORDER BY a.nombre`],

  ['2 · Movimientos del Termo (los últimos 40, sin límite de fecha)', `
    SELECT m.fecha_movimiento, m.tipo, m.cantidad,
           m.stockanterior, m.stocknuevo,
           a.nombre AS almacen, m.motivo
    FROM movimientos_inventario m
    JOIN productos p ON p.id = m.producto_id
    LEFT JOIN almacenes a ON a.id = m.almacen_id
    WHERE p.sku = 'INV-001'
    ORDER BY m.fecha_movimiento DESC
    LIMIT 40`],

  ['3 · Turnos de caja de los últimos 2 días', `
    SELECT t.fechaapertura, t.fechacierre, t.estado, t.fondoinicial,
           t.totalentradas, t.totalsalidas, t.efectivoesperado,
           t.efectivocontado, t.diferencia
    FROM caja_turnos t
    WHERE t.fechaapertura > now() - interval '2 days'
    ORDER BY t.fechaapertura`],

  ['4 · Pólizas de las últimas 48 h', `
    SELECT p.folio, p.fecha, p.tipo, p.concepto,
           p.origentipo, p.origenclave, p.estatus
    FROM polizas p
    WHERE p.fechacreacion > now() - interval '48 hours'
    ORDER BY p.fechacreacion`],

  ['5 · Ventas de las últimas 48 h', `
    SELECT v.folio, v.estado, v.total, v.totaldevuelto, v.fechaventa
    FROM ventas v
    WHERE v.fechaventa > now() - interval '48 hours'
    ORDER BY v.fechaventa`],

  ['6 · Partidas de las pólizas de las últimas 48 h', `
    SELECT p.folio, c.numerocuenta, c.nombre AS cuenta, d.cargo, d.abono
    FROM partidas_poliza d
    JOIN polizas p ON p.id = d.polizaid
    LEFT JOIN cuentas_contables c ON c.id = d.cuentacontableid
    WHERE p.fechacreacion > now() - interval '48 hours'
    ORDER BY p.folio, c.numerocuenta`],
];

await cliente.connect();
for (const [titulo, sql] of consultas) {
  console.log('\n===== ' + titulo + ' =====');
  try {
    const r = await cliente.query(sql);
    if (!r.rows.length) console.log('(sin filas)');
    else console.table(r.rows);
  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
}
await cliente.end();
