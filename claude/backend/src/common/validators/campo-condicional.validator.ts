import { registerDecorator, ValidationArguments } from 'class-validator';

/**
 * ============================================================================
 * Un campo que falta se dice una vez, y se dice en español
 * ----------------------------------------------------------------------------
 * `@ValidateIf` + los validadores de forma es la manera natural de escribir
 * «esto es obligatorio sólo cuando…», y tiene un defecto que sólo se ve
 * mandando una petición de verdad: cuando el campo NO viene, todos los
 * validadores de forma opinan a la vez sobre `undefined`.
 *
 * Medido el 25-sep-2026 contra la instalación, al pedir el alta de un puesto
 * sin sus datos —cinco campos ausentes— la respuesta traía **diez mensajes**:
 *
 *   «clave must be shorter than or equal to 20 characters»   ← no hay ninguno
 *   «clave must be longer than or equal to 1 characters»
 *   «clave must be a string»                                  ← no es un tipo
 *   «salarioMinimo must not be less than 0.01»                ← no hay cifra
 *   …
 *
 * La mitad son falsos, todos menos uno están en inglés, y el que de verdad
 * importa —«falta la clave del puesto»— no está en ninguna parte. Quien lee eso
 * no aprende qué le falta: aprende a no leer los errores.
 *
 * Este decorador dice una sola cosa por campo: si falta, que falta; si viene
 * mal, en qué. Es el hermano de `EsJustificacion`, para campos que no son
 * texto libre.
 * ============================================================================
 */
export type FormaDeCampo = 'texto' | 'numero' | 'entero' | 'uuid' | 'correo' | 'clave';

export interface OpcionesCampoCondicional {
  /** Cuándo es obligatorio. Por omisión, siempre. */
  requeridoCuando?: (objeto: any) => boolean;
  /** Qué decir cuando falta. Es el único mensaje que verá la persona. */
  cuandoFalta: string;
  forma: FormaDeCampo;
  minimo?: number;
  maximo?: number;
  /** Cómo llamar al campo en el mensaje de forma. Ej: «La clave del puesto». */
  etiqueta: string;
  /** Sólo para `forma: 'clave'`: la forma exacta que debe tener. */
  patron?: RegExp;
}

/** Comprobación deliberadamente laxa: la única prueba real de un correo es enviarlo. */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Ausente de verdad: `undefined`, `null` o texto en blanco. */
const ausente = (valor: unknown): boolean =>
  valor === undefined ||
  valor === null ||
  (typeof valor === 'string' && valor.trim() === '');

function problemaDeForma(
  valor: unknown,
  o: OpcionesCampoCondicional,
): string | null {
  if (o.forma === 'texto') {
    if (typeof valor !== 'string') return `${o.etiqueta} debe ser texto.`;
    const t = valor.trim();
    if (o.minimo != null && t.length < o.minimo) {
      return `${o.etiqueta} debe tener al menos ${o.minimo} ${o.minimo === 1 ? 'carácter' : 'caracteres'}.`;
    }
    if (o.maximo != null && t.length > o.maximo) {
      return `${o.etiqueta} no puede pasar de ${o.maximo} caracteres.`;
    }
    return null;
  }

  if (o.forma === 'clave') {
    if (typeof valor !== 'string') return `${o.etiqueta} debe ser texto.`;
    return o.patron && o.patron.test(valor.trim())
      ? null
      : `${o.etiqueta} no tiene la forma esperada.`;
  }

  if (o.forma === 'correo') {
    if (typeof valor !== 'string') return `${o.etiqueta} debe ser texto.`;
    const t = valor.trim();
    if (o.maximo != null && t.length > o.maximo) {
      return `${o.etiqueta} no puede pasar de ${o.maximo} caracteres.`;
    }
    return CORREO.test(t) ? null : `${o.etiqueta} no tiene forma de correo.`;
  }

  if (o.forma === 'uuid') {
    return typeof valor === 'string' && UUID.test(valor)
      ? null
      : `${o.etiqueta} no tiene la forma de un identificador del sistema.`;
  }

  const n = Number(valor);
  if (!Number.isFinite(n)) return `${o.etiqueta} debe ser un número.`;
  if (o.forma === 'entero' && !Number.isInteger(n)) {
    return `${o.etiqueta} debe ser un número entero.`;
  }
  if (o.minimo != null && n < o.minimo) {
    return `${o.etiqueta} no puede ser menor que ${o.minimo}.`;
  }
  if (o.maximo != null && n > o.maximo) {
    return `${o.etiqueta} no puede ser mayor que ${o.maximo}.`;
  }
  return null;
}

export function EsCampoCondicional(opciones: OpcionesCampoCondicional) {
  const obligatorio = opciones.requeridoCuando ?? (() => true);

  return function (objetivo: object, propiedad: string) {
    registerDecorator({
      name: 'esCampoCondicional',
      target: objetivo.constructor,
      propertyName: propiedad,
      validator: {
        validate(valor: unknown, args: ValidationArguments) {
          if (ausente(valor)) return !obligatorio(args.object);
          return problemaDeForma(valor, opciones) === null;
        },
        defaultMessage(args: ValidationArguments) {
          if (ausente(args.value)) return opciones.cuandoFalta;
          return (
            problemaDeForma(args.value, opciones) ??
            `${opciones.etiqueta} no es válida.`
          );
        },
      },
    });
  };
}
