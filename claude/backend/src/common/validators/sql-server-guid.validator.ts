import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, Matches, ValidationOptions } from 'class-validator';

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

/**
 * ============================================================================
 * Un identificador opcional que llega vacío es un identificador ausente
 * ----------------------------------------------------------------------------
 * `@IsOptional()` de class-validator sólo perdona `undefined` y `null`. La
 * CADENA VACÍA la deja pasar al validador, que la rechaza. Y la cadena vacía es
 * justo lo que manda un formulario cuando su `<select>` está en la opción en
 * blanco: el navegador no tiene forma de enviar «nada».
 *
 * El efecto era éste: dar de alta un cliente sin elegir estado —que es
 * legítimo, el campo es opcional— fallaba con «estadoId debe ser un GUID válido
 * de SQL Server». Un mensaje que no menciona el campo que el usuario ve, sobre
 * un dato que ni siquiera quiso capturar.
 *
 * Se resuelve donde nace: antes de validar, la cadena vacía se convierte en
 * ausencia. Sólo aplica a identificadores, nunca a texto libre: un `''` en un
 * campo de notas SÍ significa algo —«bórralo»— y convertirlo en `undefined`
 * haría que un PATCH no pudiera vaciar nunca un campo.
 * ============================================================================
 */
export function IsSqlServerGuidOpcional(
  validationOptions: ValidationOptions = {},
): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    ),
    IsOptional(),
    IsSqlServerGuid(validationOptions),
  );
}
