import { registerDecorator, ValidationArguments } from 'class-validator';

/**
 * ============================================================================
 * SyncroERP · El motivo del rechazo, dicho una sola vez
 * ----------------------------------------------------------------------------
 * LA REGLA
 *
 * Aprobar no obliga a justificarse; rechazar sí. Es lo que promete la pantalla
 * («Comentario (obligatorio si rechazas)») y lo que hace cualquier ERP.
 *
 * ----------------------------------------------------------------------------
 * POR QUE UN VALIDADOR PROPIO Y NO TRES DECORADORES
 *
 * La regla se expresaba con `@ValidateIf` + `@IsString` + `@MinLength` +
 * `@MaxLength`. Cuando el campo no venia, los cuatro opinaban y la persona
 * recibia TRES errores, medidos el 25-sep-2026 contra la instalacion:
 *
 *   «comentario must be shorter than or equal to 500 characters»
 *   «Al rechazar hay que decir por que: escribe el motivo (minimo 3 caracteres).»
 *   «comentario must be a string»
 *
 * El primero y el tercero son falsos: no hay 501 caracteres ni un tipo
 * equivocado, no hay nada. El unico cierto queda enterrado entre dos mentiras.
 * Quien lee eso no aprende que le falta el motivo: aprende a no leer los
 * errores, y asi es como se pierde despues el que si importa.
 *
 * Una sola condicion produce un solo mensaje, y el mensaje dice cual de los
 * tres problemas posibles es el que hay.
 * ============================================================================
 */

const ESTADOS_QUE_RECHAZAN = new Set(['RECHAZADA', 'RECHAZADO']);

const esRechazo = (objeto: unknown): boolean =>
  ESTADOS_QUE_RECHAZAN.has(
    String((objeto as { estado?: unknown } | undefined)?.estado ?? ''),
  );

export function EsMotivoDeRechazo() {
  return function (objetivo: object, propiedad: string) {
    registerDecorator({
      name: 'esMotivoDeRechazo',
      target: objetivo.constructor,
      propertyName: propiedad,
      validator: {
        validate(valor: unknown, args: ValidationArguments) {
          const rechaza = esRechazo(args.object);
          // Ausente: solo es un problema cuando se esta rechazando.
          if (valor === undefined || valor === null) return !rechaza;
          // Un numero o un objeto es un cliente mal escrito, se rechaza siempre.
          if (typeof valor !== 'string') return false;
          const texto = valor.trim();
          if (!texto) return !rechaza;
          return texto.length >= 3 && texto.length <= 500;
        },
        defaultMessage(args: ValidationArguments) {
          const valor = args.value;
          if (valor != null && typeof valor !== 'string') {
            return 'El motivo debe ser texto.';
          }
          if (typeof valor === 'string' && valor.trim().length > 500) {
            return 'El motivo no puede pasar de 500 caracteres.';
          }
          return 'Al rechazar hay que decir por qué: escribe el motivo (mínimo 3 caracteres).';
        },
      },
    });
  };
}
