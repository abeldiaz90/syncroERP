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
      SELECT name AS nombre
      FROM sys.tables
      WHERE is_ms_shipped = 0
    `);
    const nombres = new Set(existentes.map((fila) => fila.nombre));
    const faltantes = tablasEsperadas.filter((tabla) => !nombres.has(tabla));
    const hayMigracionesPendientes = await dataSource.showMigrations();

    const columnasBancarias: Array<{ total: number }> = await dataSource.query(`
      SELECT COUNT(*) AS total
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'cuentas_bancarias'
        AND COLUMN_NAME IN ('bancoId', 'clabe')
    `);

    if (faltantes.length || hayMigracionesPendientes) {
      throw new Error(
        [
          faltantes.length
            ? `Tablas faltantes: ${faltantes.join(', ')}.`
            : '',
          hayMigracionesPendientes ? 'Hay migraciones pendientes.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    }
    if (Number(columnasBancarias[0]?.total ?? 0) !== 2) {
      throw new Error(
        'Faltan bancoId o clabe en la tabla cuentas_bancarias.',
      );
    }

    logger.log(
      `Esquema correcto: ${tablasEsperadas.length} entidades, sin migraciones pendientes.`,
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
