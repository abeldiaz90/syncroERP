import { registerDecorator, ValidationArguments } from 'class-validator';

import { revisarRfc } from '../utils/rfc.util';

/**
 * ============================================================================
 * SyncroERP · El RFC, comprobado donde se captura
 * ----------------------------------------------------------------------------
 * El RFC del cliente va en CADA CFDI que se le emita. Hasta hoy el DTO pedia
 * `@IsString()` y nada mas: «12345» entraba, se guardaba, y fallaba meses
 * despues al timbrar, con facturas ya emitidas que hay que cancelar.
 *
 * Opcional de verdad: vacio pasa, porque un cliente de mostrador puede no
 * tenerlo todavia. Lo que no pasa es uno equivocado.
 *
 * La regla —y por que no se comprueba el digito verificador— vive en
 * `common/utils/rfc.util.ts`.
 * ============================================================================
 */
export function EsRfcOpcional() {
  return function (objetivo: object, propiedad: string) {
    registerDecorator({
      name: 'esRfcOpcional',
      target: objetivo.constructor,
      propertyName: propiedad,
      validator: {
        validate(valor: unknown) {
          if (valor === undefined || valor === null) return true;
          if (typeof valor !== 'string') return false;
          if (!valor.trim()) return true;
          return revisarRfc(valor).valido;
        },
        defaultMessage(args: ValidationArguments) {
          const valor = args.value;
          if (typeof valor !== 'string') return 'El RFC debe ser texto.';
          return (
            revisarRfc(valor).motivo ?? 'El RFC no tiene un formato válido.'
          );
        },
      },
    });
  };
}

/**
 * La misma regla, obligatoria. Para el RFC del emisor —configuración fiscal y
 * configuración patronal— y para el receptor de un CFDI, donde no hay CFDI
 * posible sin él.
 */
export function EsRfc() {
  return function (objetivo: object, propiedad: string) {
    registerDecorator({
      name: 'esRfc',
      target: objetivo.constructor,
      propertyName: propiedad,
      validator: {
        validate(valor: unknown) {
          if (typeof valor !== 'string') return false;
          return revisarRfc(valor).valido;
        },
        defaultMessage(args: ValidationArguments) {
          const valor = args.value;
          if (typeof valor !== 'string') return 'El RFC es obligatorio.';
          return (
            revisarRfc(valor).motivo ?? 'El RFC no tiene un formato válido.'
          );
        },
      },
    });
  };
}
