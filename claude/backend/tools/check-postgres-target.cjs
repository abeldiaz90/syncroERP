const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), override: true });

async function main() {
  console.log(`Conectando a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  const result = await client.query('SELECT current_user, current_database()');
  console.log(`PostgreSQL accesible: ${result.rows[0].current_database}`);
  await client.end();
}

main().catch((error) => {
  console.error(`PostgreSQL no accesible: ${error.code ?? error.message}`);
  process.exitCode = 1;
});
