import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, ValidationOptions } from 'class-validator';

/**
 * ============================================================================
 * Fecha opcional que de verdad es opcional
 * ----------------------------------------------------------------------------
 * Tercera vez que aparece el mismo defecto, y la tercera con el mismo remedio:
 * `@IsOptional()` omite la validación cuando el valor es `undefined` o `null`,
 * **no cuando es una cadena vacía**. Y un `<input type="date">` que nadie tocó
 * vale `''`, no `undefined`.
 *
 * Se vio el 25-sep-2026 creando la primera oportunidad del CRM desde la
 * pantalla: el formulario mandaba `fechaCierreEstimada: ''` —el campo dice
 * «Cierre estimado», sin asterisco, así que se puede dejar en blanco— y el
 * servidor contestaba 400. La pantalla no se cerraba, el aviso de error
 * duraba cuatro segundos, y quien lo intentaba volvía a pulsar el botón sin
 * saber qué estaba mal.
 *
 * Había nueve campos de fecha opcionales así repartidos por el ERP: la fecha
 * requerida de una requisición, la de pago de una orden de compra, el inicio
 * de un crédito, la fecha de una factura y la de inicio contable del asistente
 * financiero, entre otros. Todos rechazaban el formulario que dejaba el campo
 * como el propio formulario permite dejarlo.
 *
 * Igual que `@IsEmailOpcional` y `@IsSqlServerGuidOpcional`: la cadena vacía se
 * convierte en ausencia antes de validar, para que «no lo llené» y «no lo
 * mandé» signifiquen lo mismo.
 * ============================================================================
 */
export function IsFechaOpcional(
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
    IsDateString(
      {},
      {
        message: '$property debe ser una fecha válida',
        ...validationOptions,
      },
    ),
  );
}
