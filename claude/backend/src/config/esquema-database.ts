/**
 * Decide si TypeORM puede materializar el esquema al arrancar.
 * La condición de producción es deliberadamente dominante: DB_SYNC=true no
 * puede sobreescribirla por un error de configuración.
 */
export function debeSincronizarEsquema(
  nodeEnv: string | undefined,
  dbSync: string | undefined,
): boolean {
  return nodeEnv !== 'production' && dbSync === 'true';
}

/** Ejecuta migraciones automáticamente sólo cuando se habilita de forma explícita. */
export function debeEjecutarMigraciones(
  nodeEnv: string | undefined,
  dbMigrationsRun: string | undefined,
): boolean {
  return dbMigrationsRun === 'true' && ['development', 'test', 'production'].includes(nodeEnv ?? 'development');
}
