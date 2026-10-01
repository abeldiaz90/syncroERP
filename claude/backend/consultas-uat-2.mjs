/** SOLO LECTURA. Segunda tanda de verificación del UAT. */
import * as dotenv from 'dotenv';
import pg from 'pg';
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
  ['A · Movimientos del Termo (últimos 20)', `
    SELECT m.fecha_movimiento, m.tipo, m.cantidad,
           m.stock_anterior, m.stock_nuevo,
           a.nombre AS almacen, left(m.motivo, 60) AS motivo
    FROM movimientos_inventario m
    JOIN productos p ON p.id = m.producto_id
    LEFT JOIN almacenes a ON a.id = m.almacen_id
    WHERE p.sku = 'INV-001'
    ORDER BY m.fecha_movimiento DESC
    LIMIT 20`],

  ['B · ¿La ANULACIÓN reversa el IVA? — ventas anuladas con sus importes', `
    SELECT v.folio, v.estado, v.subtotal, v.impuestototal, v.total, v.metodopago
    FROM ventas v
    WHERE v.estado = 'ANULADA'
    ORDER BY v.folio`],

  ['C · Partidas de TODAS las pólizas de anulación', `
    SELECT p.folio AS poliza, left(p.concepto, 45) AS concepto,
           c.numerocuenta, c.nombre AS cuenta, d.cargo, d.abono
    FROM partidas_poliza d
    JOIN polizas p ON p.id = d.polizaid
    LEFT JOIN cuentas_contables c ON c.id = d.cuentacontableid
    WHERE p.origentipo = 'ANULACION_VENTA'
    ORDER BY p.folio, c.numerocuenta`],

  ['D · Para comparar: partidas de la venta ORIGINAL de cada anulada', `
    SELECT v.folio AS ticket, p.folio AS poliza,
           c.numerocuenta, c.nombre AS cuenta, d.cargo, d.abono
    FROM ventas v
    JOIN polizas p ON p.origenid = v.id::text AND p.origentipo = 'VENTA'
    JOIN partidas_poliza d ON d.polizaid = p.id
    LEFT JOIN cuentas_contables c ON c.id = d.cuentacontableid
    WHERE v.estado = 'ANULADA'
    ORDER BY v.folio, p.folio, c.numerocuenta`],

  ['E · Cada póliza cuadra: suma de cargos contra suma de abonos', `
    SELECT p.folio, p.tipo,
           SUM(d.cargo) AS cargos, SUM(d.abono) AS abonos,
           SUM(d.cargo) - SUM(d.abono) AS descuadre
    FROM polizas p
    JOIN partidas_poliza d ON d.polizaid = p.id
    WHERE p.estatus = 'VIGENTE'
    GROUP BY p.id, p.folio, p.tipo
    HAVING SUM(d.cargo) <> SUM(d.abono)
    ORDER BY p.folio`],
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
