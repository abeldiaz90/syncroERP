import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { LowercaseNamingStrategy } from './lowercase-naming.strategy';

// `.env` conserva la conexión SQL Server de origen durante la migración.
// `.env.local` contiene PostgreSQL y prevalece para la aplicación/CLI.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  namingStrategy: new LowercaseNamingStrategy(),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  // El historial anterior contiene T-SQL y se conserva sólo como referencia.
  // Las migraciones nuevas de PostgreSQL viven en un directorio separado.
  migrations: [__dirname + '/migrations/postgres/*{.ts,.js}'],
  // Los comandos deciden explícitamente cuándo materializar el esquema.
  // Evita que una simple importación de este DataSource altere la base.
  synchronize: false,
  ssl:
    process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  extra: {
    max: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
  },
});
