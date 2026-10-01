/* ¿De verdad desapareció la carrera? Se mide, no se afirma. */
const { Client } = require('pg');
const EMP = '11111111-1111-1111-1111-111111111111';
const N = 40;

const conectar = async () => {
  const c = new Client({ host:'localhost', port:5433, user:'postgres', database:'syncro_pruebas' });
  await c.connect(); return c;
};

/* El método NUEVO: una sola sentencia atómica. */
const nuevo = async (c, tipo) => {
  const r = await c.query(
    `INSERT INTO folio_secuencias (empresaid, tipo, anio, ultimo)
     VALUES ($1,$2,$3,1)
     ON CONFLICT (empresaid, tipo, anio)
     DO UPDATE SET ultimo = folio_secuencias.ultimo + 1
     RETURNING ultimo`, [EMP, tipo, 2099]);
  return Number(r.rows[0].ultimo);
};

/* El método VIEJO: leer el máximo y sumarle uno. */
const viejo = async (c) => {
  const r = await c.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(folio,4,12) AS BIGINT)),0) AS m FROM carrera_vieja`);
  const n = Number(r.rows[0].m) + 1;
  await new Promise(r => setTimeout(r, 5));     // la ventana, hecha visible
  await c.query(`INSERT INTO carrera_vieja (folio) VALUES ($1)`, ['XX-'+String(n).padStart(6,'0')]);
  return n;
};

(async () => {
  const base = await conectar();
  await base.query(`DROP TABLE IF EXISTS carrera_vieja`);
  await base.query(`CREATE TABLE carrera_vieja (folio varchar(32))`);
  await base.query(`DELETE FROM folio_secuencias WHERE anio=2099`);

  const clientes = await Promise.all(Array.from({length:N}, conectar));

  const nuevos = await Promise.all(clientes.map(c => nuevo(c, 'TST')));
  const viejos = await Promise.all(clientes.map(c => viejo(c)));

  const dup = a => a.length - new Set(a).size;
  console.log(`METODO NUEVO (INSERT ... ON CONFLICT): ${N} altas simultaneas -> ${new Set(nuevos).size} numeros distintos, ${dup(nuevos)} repetidos`);
  console.log(`METODO VIEJO (SELECT MAX + 1):         ${N} altas simultaneas -> ${new Set(viejos).size} numeros distintos, ${dup(viejos)} repetidos`);

  await Promise.all([...clientes, base].map(c => c.end()));
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
