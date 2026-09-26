import { registerDecorator, ValidationArguments } from 'class-validator';

/**
 * ============================================================================
 * Una justificación, y un solo mensaje cuando falta
 * ----------------------------------------------------------------------------
 * Varias decisiones del sistema exigen que alguien escriba por qué: rechazar
 * una aprobación, cancelar un cobro, descartar un aviso del espejo contable,
 * cerrar una discrepancia de conciliación. Todas comparten el mismo modo de
 * fallo si se expresan con decoradores sueltos.
 *
 * `@ValidateIf` + `@IsString` + `@MinLength` + `@MaxLength` es la forma
 * natural de escribirlo, y cuando el campo no viene los tres últimos opinan a
 * la vez. Medido el 25-sep-2026, al añadir la nota obligatoria a la
 * conciliación, la respuesta fue:
 *
 *   «nota must be shorter than or equal to 400 characters»
 *   «Cerrar una discrepancia exige una nota que explique qué se hizo.»
 *   «Cerrar una discrepancia exige una nota que explique qué se hizo.»
 *
 * El primero es falso —no hay 401 caracteres, no hay ninguno— y el cierto
 * aparece dos veces. Es exactamente el defecto que `EsMotivoDeRechazo` ya
 * había corregido en las aprobaciones, reaparecido en otro sitio: señal de que
 * lo que hacía falta era la regla reutilizable, no otro parche.
 *
 * Una sola condición produce un solo mensaje, y el mensaje dice cuál de los
 * tres problemas posibles es el que hay.
 * ============================================================================
 */
export interface OpcionesJustificacion {
  /** Cuándo es obligatoria. Por omisión, siempre. */
  requeridaCuando?: (objeto: any) => boolean;
  /** Qué decir cuando falta. Es el único mensaje que verá la persona. */
  cuandoFalta: string;
  minimo?: number;
  maximo?: number;
}

export function EsJustificacion(opciones: OpcionesJustificacion) {
  const minimo = opciones.minimo ?? 5;
  const maximo = opciones.maximo ?? 400;
  const obligatoria = opciones.requeridaCuando ?? (() => true);

  return function (objetivo: object, propiedad: string) {
    registerDecorator({
      name: 'esJustificacion',
      target: objetivo.constructor,
      propertyName: propiedad,
      validator: {
        validate(valor: unknown, args: ValidationArguments) {
          const hace_falta = obligatoria(args.object);
          if (valor === undefined || valor === null) return !hace_falta;
          // Un número o un objeto es un cliente mal escrito: se rechaza siempre.
          if (typeof valor !== 'string') return false;
          const texto = valor.trim();
          if (!texto) return !hace_falta;
          return texto.length >= minimo && texto.length <= maximo;
        },
        defaultMessage(args: ValidationArguments) {
          const valor = args.value;
          if (valor != null && typeof valor !== 'string') {
            return 'La justificación debe ser texto.';
          }
          if (typeof valor === 'string' && valor.trim().length > maximo) {
            return `La justificación no puede pasar de ${maximo} caracteres.`;
          }
          return opciones.cuandoFalta;
        },
      },
    });
  };
}
