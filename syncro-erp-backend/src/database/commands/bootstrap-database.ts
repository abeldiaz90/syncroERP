import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import dataSource from '../data-source';
import { AppModule } from '../../app.module';

/**
 * Inicializa EXCLUSIVAMENTE una base existente y sin tablas de negocio.
 *
 * `synchronize` está prohibido en el arranque productivo. Aquí se usa de forma
 * deliberada, una sola vez y después de comprobar que el esquema está vacío,
 * para materializar el modelo completo de las entidades actuales. A
 * continuación se ejecutan las migraciones idempotentes y los sembradores.
 */
async function ejecutar() {
  const logger = new Logger('DB Bootstrap');
  await dataSource.initialize();
  try {
    const filas: Array<{ total: number }> = await dataSource.query(`
      SELECT COUNT(*) AS total
      FROM sys.tables
      WHERE name NOT IN ('migrations', 'typeorm_metadata')
        AND is_ms_shipped = 0
    `);
    const total = Number(filas[0]?.total ?? 0);
    if (total > 0) {
      throw new Error(
        `La base contiene ${total} tablas de negocio. Este comando sólo puede ejecutarse sobre un esquema vacío.`,
      );
    }

    logger.log('Creando el esquema completo desde las entidades...');
    await dataSource.synchronize(false);
    logger.log('Ejecutando migraciones de endurecimiento...');
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }

  logger.log('Ejecutando catálogos y datos iniciales idempotentes...');
  const aplicacion = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  await aplicacion.close();
  logger.log('Base inicializada correctamente.');
}

ejecutar().catch((error) => {
  new Logger('DB Bootstrap').error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
