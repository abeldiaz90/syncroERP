import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import dataSource from '../data-source';
import { AppModule } from '../../app.module';

const CONFIRMACION = 'RECREAR_BD_DESARROLLO';

async function ejecutar() {
  const logger = new Logger('DB Rebuild Dev');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La reconstrucción de base está bloqueada en producción.');
  }
  if (process.env.DB_REBUILD_CONFIRM !== CONFIRMACION) {
    throw new Error(
      `Operación destructiva bloqueada. Configura DB_REBUILD_CONFIRM=${CONFIRMACION} sólo en una base local desechable.`,
    );
  }

  await dataSource.initialize();
  try {
    const baseActual = String(process.env.DB_NAME ?? '').toLowerCase();
    if (!/(dev|local|test|sandbox)/.test(baseActual)) {
      throw new Error(
        `La base "${process.env.DB_NAME ?? ''}" no parece de desarrollo. Incluye dev, local, test o sandbox en DB_NAME.`,
      );
    }
    logger.warn(`Eliminando y reconstruyendo el esquema de ${process.env.DB_NAME}...`);
    await dataSource.dropDatabase();
    await dataSource.synchronize(false);
    await dataSource.runMigrations({ transaction: 'all' });
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }

  const aplicacion = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  await aplicacion.close();
  logger.log('Base de desarrollo reconstruida y datos iniciales aplicados.');
}

ejecutar().catch((error) => {
  new Logger('DB Rebuild Dev').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
