import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

/**
 * PostgreSQL pliega a minúsculas los identificadores SQL sin comillas. El ERP
 * contiene consultas históricas con nombres camelCase sin comillas; guardar
 * físicamente tablas y columnas en minúsculas permite que convivan con las
 * consultas generadas (y escapadas) por TypeORM sin una segunda copia del
 * esquema.
 */
export class LowercaseNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(targetName: string, userSpecifiedName?: string): string {
    return (userSpecifiedName ?? targetName).toLowerCase();
  }

  columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    return `${embeddedPrefixes.join('')}${customName || propertyName}`.toLowerCase();
  }

  relationName(propertyName: string): string {
    return propertyName.toLowerCase();
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return `${relationName}${referencedColumnName}`.toLowerCase();
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return `${firstTableName}_${firstPropertyName.replace(/\./g, '_')}_${secondTableName}`.toLowerCase();
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return `${tableName}_${columnName || propertyName}`.toLowerCase();
  }
}
