const path = require('node:path');
const dotenv = require('dotenv');
const sql = require('mssql');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const pool = await sql.connect({
    server: process.env.SOURCE_DB_HOST ?? process.env.DB_HOST,
    port: Number(process.env.SOURCE_DB_PORT ?? process.env.DB_PORT ?? 1433),
    user: process.env.SOURCE_DB_USER ?? process.env.DB_USER,
    password: process.env.SOURCE_DB_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.SOURCE_DB_NAME ?? process.env.DB_NAME,
    options: {
      encrypt: (process.env.SOURCE_DB_ENCRYPT ?? process.env.DB_ENCRYPT) === 'true',
      trustServerCertificate: true,
    },
  });
  const result = await pool.request().query(
    "SELECT COUNT(*) AS tablas FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'",
  );
  console.log(`SQL Server accesible; tablas: ${result.recordset[0].tablas}`);
  await pool.close();
}

main().catch((error) => {
  console.error(`SQL Server no accesible: ${error.code ?? error.message}`);
  process.exitCode = 1;
});
