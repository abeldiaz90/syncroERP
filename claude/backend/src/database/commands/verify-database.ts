import 'dotenv/config';
import { Logger } from '@nestjs/common';
import dataSource from '../data-source';

async function ejecutar() {
  const logger = new Logger('DB Verify');
  await dataSource.initialize();
  try {
    const tablasEsperadas = [
      ...new Set(dataSource.entityMetadatas.map((meta) => meta.tablePath)),
    ];
    const existentes: Array<{ nombre: string }> = await dataSource.query(`
      SELECT tablename AS nombre
      FROM pg_catalog.pg_tables
      WHERE schemaname = current_schema()
    `);
    const nombres = new Set(existentes.map((fila) => fila.nombre));
    const faltantes = tablasEsperadas.filter((tabla) => !nombres.has(tabla));
    const columnasBancarias: Array<{ total: number }> = await dataSource.query(`
      SELECT COUNT(*)::int AS total
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'cuentas_bancarias'
        AND column_name IN ('bancoid', 'clabe')
    `);

    if (faltantes.length) {
      throw new Error(`Tablas faltantes: ${faltantes.join(', ')}.`);
    }
    if (Number(columnasBancarias[0]?.total ?? 0) !== 2) {
      throw new Error('Faltan bancoId o clabe en la tabla cuentas_bancarias.');
    }

    logger.log(
      `Esquema correcto: ${tablasEsperadas.length} entidades materializadas.`,
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

ejecutar().catch((error) => {
  new Logger('DB Verify').error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
