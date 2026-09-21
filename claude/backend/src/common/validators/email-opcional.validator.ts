import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, ValidationOptions } from 'class-validator';

/**
 * ============================================================================
 * Correo opcional que de verdad es opcional
 * ----------------------------------------------------------------------------
 * `@IsOptional()` omite la validación cuando el valor es `undefined` o `null`.
 * **No cuando es una cadena vacía.** Y un formulario web manda cadena vacía:
 * un `<input>` que nadie tocó vale `''`, no `undefined`.
 *
 * El síntoma es el que apareció al dar de alta un proveedor: la pantalla dice
 * —correctamente— «captura el email de la empresa o el del contacto», se
 * captura uno, y el servidor rechaza el alta con «email must be an email»
 * refiriéndose al que se dejó en blanco. El usuario ve un error sobre un campo
 * que decidió no llenar porque el propio formulario le dijo que podía.
 *
 * Es el mismo defecto que ya obligó a crear `@IsSqlServerGuidOpcional`, y la
 * solución es la misma: convertir la cadena vacía en ausencia antes de
 * validar, para que «no lo llené» y «no lo mandé» signifiquen lo mismo.
 * ============================================================================
 */
export function IsEmailOpcional(
  validationOptions: ValidationOptions = {},
): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' && value.trim() === ''
        ? undefined
        : typeof value === 'string'
          ? value.trim()
          : value,
    ),
    IsOptional(),
    IsEmail(
      {},
      {
        message: '$property debe ser un correo electrónico válido',
        ...validationOptions,
      },
    ),
  );
}
