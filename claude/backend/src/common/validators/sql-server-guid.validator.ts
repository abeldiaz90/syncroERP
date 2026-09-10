import { Matches, ValidationOptions } from 'class-validator';

/**
 * SQL Server acepta cualquier valor hexadecimal con forma 8-4-4-4-12 en una
 * columna uniqueidentifier. @IsUUID() es más estricto: también exige bits de
 * versión RFC (1-5), por lo que rechazaba IDs históricos como ...-F111-....
 */
export const SQL_SERVER_GUID_REGEX =
  /^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function IsSqlServerGuid(
  validationOptions: ValidationOptions = {},
): PropertyDecorator {
  return Matches(SQL_SERVER_GUID_REGEX, {
    message: '$property debe ser un GUID válido de SQL Server',
    ...validationOptions,
  });
}
