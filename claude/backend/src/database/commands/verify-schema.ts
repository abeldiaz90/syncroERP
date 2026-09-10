import AppDataSource from '../data-source';

type ColumnaSql = { esquema: string; tabla: string; columna: string };
type TablaSql = { esquema: string; tabla: string };

/** Compara tablas y columnas de las entidades contra la base sin modificarla. */
async function main() {
  await AppDataSource.initialize();
  try {
    const esquemaPorOmision =
      AppDataSource.options.type === 'postgres' ? 'public' : 'dbo';

    const [tablasSql, columnasSql] = await Promise.all([
      AppDataSource.query(`
        SELECT TABLE_SCHEMA AS esquema, TABLE_NAME AS tabla
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE='BASE TABLE'
      `) as Promise<TablaSql[]>,
      AppDataSource.query(`
        SELECT TABLE_SCHEMA AS esquema, TABLE_NAME AS tabla, COLUMN_NAME AS columna
        FROM INFORMATION_SCHEMA.COLUMNS
      `) as Promise<ColumnaSql[]>,
    ]);

    const tablasExistentes = new Set(
      tablasSql.map(({ esquema, tabla }) => `${esquema}.${tabla}`.toLowerCase()),
    );
    const columnasExistentes = new Set(
      columnasSql.map(({ esquema, tabla, columna }) =>
        `${esquema}.${tabla}.${columna}`.toLowerCase(),
      ),
    );

    const tablasFaltantes: string[] = [];
    const columnasFaltantes: string[] = [];
    for (const entidad of AppDataSource.entityMetadatas) {
      // 'dbo' era el esquema por omisión de SQL Server. Tras migrar a Postgres
      // el esquema es 'public', y con el valor viejo TODAS las tablas salían
      // como faltantes: un verificador que siempre grita no verifica nada.
      const esquema = entidad.schema || esquemaPorOmision;
      const tabla = `${esquema}.${entidad.tableName}`;
      if (!tablasExistentes.has(tabla.toLowerCase())) {
        tablasFaltantes.push(tabla);
        continue;
      }
      for (const columna of entidad.columns) {
        const nombre = `${tabla}.${columna.databaseName}`;
        if (!columnasExistentes.has(nombre.toLowerCase())) columnasFaltantes.push(nombre);
      }
    }

    if (tablasFaltantes.length || columnasFaltantes.length) {
      console.error('ERROR: el esquema SQL no coincide con las entidades actuales.');
      if (tablasFaltantes.length) {
        console.error(`Tablas faltantes (${tablasFaltantes.length}):`);
        for (const tabla of tablasFaltantes) {
          console.error(`  - ${tabla}${tabla.toLowerCase().endsWith('.roles') ? '  <-- requerida para IAM y permisos' : ''}`);
        }
      }
      if (columnasFaltantes.length) {
        console.error(`Columnas faltantes (${columnasFaltantes.length}):`);
        for (const columna of columnasFaltantes) console.error(`  - ${columna}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `Esquema compatible: ${AppDataSource.entityMetadatas.length} tablas y ` +
        `${AppDataSource.entityMetadatas.reduce((total, entidad) => total + entidad.columns.length, 0)} columnas verificadas.`,
    );
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
