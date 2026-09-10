const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const sql = require('mssql');
const { Client } = require('pg');

const backend = path.resolve(__dirname, '..');
const source = dotenv.parse(fs.readFileSync(path.join(backend, '.env')));
const target = dotenv.parse(fs.readFileSync(path.join(backend, '.env.local')));
const execute = process.argv.includes('--execute');
const batchSize = 250;

const mssqlName = (value) => `[${String(value).replace(/]/g, ']]')}]`;
const pgName = (value) => `"${String(value).replace(/"/g, '""')}"`;

function sourceConfig() {
  return {
    server: source.SOURCE_DB_HOST ?? source.DB_HOST,
    port: Number(source.SOURCE_DB_PORT ?? source.DB_PORT ?? 1433),
    user: source.SOURCE_DB_USER ?? source.DB_USER,
    password: source.SOURCE_DB_PASSWORD ?? source.DB_PASSWORD,
    database: source.SOURCE_DB_NAME ?? source.DB_NAME,
    options: {
      encrypt: (source.SOURCE_DB_ENCRYPT ?? source.DB_ENCRYPT) === 'true',
      trustServerCertificate: true,
    },
    pool: { min: 0, max: 5 },
    requestTimeout: 120_000,
  };
}

function targetConfig() {
  return {
    host: target.DB_HOST,
    port: Number(target.DB_PORT ?? 5432),
    user: target.DB_USER,
    password: target.DB_PASSWORD,
    database: target.DB_NAME,
  };
}

function normalize(value, dataType) {
  if (value == null) return null;
  if (dataType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return ['1', 'true', 't', 'yes', 'si', 'sí'].includes(String(value).toLowerCase());
  }
  if ((dataType === 'json' || dataType === 'jsonb') && typeof value !== 'string') {
    return JSON.stringify(value);
  }
  return typeof value === 'string' ? value.replace(/\u0000/g, '') : value;
}

async function metadata(pool, pg) {
  const sourceColumns = await pool.request().query(`
    SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
           COLUMN_NAME AS column_name, ORDINAL_POSITION AS ordinal_position
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
  `);
  const targetColumns = await pg.query(`
    SELECT table_name, column_name, ordinal_position, data_type, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const sourceTables = new Map();
  for (const row of sourceColumns.recordset) {
    const key = row.table_name.toLowerCase();
    const table = sourceTables.get(key) ?? {
      schema: row.table_schema,
      name: row.table_name,
      columns: new Map(),
    };
    table.columns.set(row.column_name.toLowerCase(), row.column_name);
    sourceTables.set(key, table);
  }
  const targetTables = new Map();
  for (const row of targetColumns.rows) {
    const key = row.table_name.toLowerCase();
    const table = targetTables.get(key) ?? { name: row.table_name, columns: [] };
    if (row.is_generated === 'NEVER') table.columns.push(row);
    targetTables.set(key, table);
  }
  return { sourceTables, targetTables };
}

async function copyTable(pool, pg, sourceTable, targetTable) {
  const columns = targetTable.columns
    .map((column) => ({ ...column, sourceName: sourceTable.columns.get(column.column_name.toLowerCase()) }))
    .filter((column) => column.sourceName);
  if (!columns.length) return 0;

  await pg.query(`DELETE FROM ${pgName(targetTable.name)}`);
  let offset = 0;
  let copied = 0;
  for (;;) {
    const request = pool.request();
    request.input('offset', sql.Int, offset);
    request.input('batch', sql.Int, batchSize);
    const selected = columns.map((column) => mssqlName(column.sourceName)).join(', ');
    const result = await request.query(`
      SELECT ${selected}
      FROM ${mssqlName(sourceTable.schema)}.${mssqlName(sourceTable.name)}
      ORDER BY (SELECT NULL)
      OFFSET @offset ROWS FETCH NEXT @batch ROWS ONLY
    `);
    if (!result.recordset.length) break;

    const values = [];
    const tuples = result.recordset.map((row) => {
      const params = columns.map((column) => {
        values.push(normalize(row[column.sourceName], column.data_type));
        return `$${values.length}`;
      });
      return `(${params.join(', ')})`;
    });
    const identity = columns.some((column) => column.is_identity === 'YES')
      ? ' OVERRIDING SYSTEM VALUE'
      : '';
    await pg.query(
      `INSERT INTO ${pgName(targetTable.name)} (${columns.map((column) => pgName(column.column_name)).join(', ')})${identity} VALUES ${tuples.join(', ')}`,
      values,
    );
    copied += result.recordset.length;
    offset += result.recordset.length;
    if (result.recordset.length < batchSize) break;
  }
  return copied;
}

async function main() {
  const pool = await sql.connect(sourceConfig());
  const pg = new Client(targetConfig());
  await pg.connect();
  try {
    const { sourceTables, targetTables } = await metadata(pool, pg);
    const shared = [...targetTables.entries()].filter(([name]) => sourceTables.has(name));
    const sourceOnly = [...sourceTables.keys()].filter((name) => !targetTables.has(name));
    const targetOnly = [...targetTables.keys()].filter((name) => !sourceTables.has(name));
    console.log(`Tablas compatibles: ${shared.length}`);
    console.log(`Sólo SQL Server: ${sourceOnly.length}`);
    console.log(`Sólo PostgreSQL: ${targetOnly.length}`);
    if (sourceOnly.length) console.log(`Sin destino: ${sourceOnly.join(', ')}`);
    if (targetOnly.length) console.log(`Nuevas: ${targetOnly.join(', ')}`);
    if (!execute) {
      console.log('Inventario terminado. Usa --execute para copiar los datos.');
      return;
    }

    await pg.query('BEGIN');
    await pg.query("SET LOCAL session_replication_role = 'replica'");
    let totalRows = 0;
    for (const [name, targetTable] of shared) {
      const count = await copyTable(pool, pg, sourceTables.get(name), targetTable);
      totalRows += count;
      console.log(`${name}: ${count}`);
    }
    await pg.query("SET LOCAL session_replication_role = 'origin'");
    await pg.query('COMMIT');
    console.log(`Migración completada: ${totalRows} filas en ${shared.length} tablas.`);
  } catch (error) {
    await pg.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await pg.end().catch(() => undefined);
    await pool.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`Migración cancelada: ${error.message}`);
  process.exitCode = 1;
});
