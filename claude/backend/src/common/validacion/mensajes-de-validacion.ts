/**
 * ============================================================================
 * Un campo, un mensaje — y que sea cierto
 * ----------------------------------------------------------------------------
 * `class-validator` evalúa TODOS los decoradores de un campo, también cuando el
 * campo no viene. Un `@IsString() @MinLength(5) @MaxLength(500)` obligatorio
 * produce, ante un valor ausente, tres violaciones a la vez:
 *
 *   «motivo must be shorter than or equal to 500 characters»  ← no hay ninguno
 *   «motivo must be longer than or equal to 5 characters»
 *   «motivo must be a string»                                 ← no es un tipo
 *
 * Dos de las tres son falsas y ninguna dice lo único que importa: que falta.
 * Quien lee eso no aprende qué corregir; aprende a no leer los errores, y así
 * es como se pierde después el que sí importaba.
 *
 * Los DTO que más se usan ya llevan validadores propios —`EsJustificacion`,
 * `EsCampoCondicional`, `EsRfc`— que dicen una sola cosa y la dicen en español.
 * Esto es el suelo para todos los demás: cuando el valor está AUSENTE y hay más
 * de una queja, se sustituyen por una sola, cierta y en español. Si el valor
 * viene y está mal, se conservan todas —cada una señala algo distinto— sin
 * repetir texto.
 *
 * No cambia qué se rechaza, sólo qué se lee.
 * ============================================================================
 */
export interface ErrorDeValidacion {
  property: string;
  value?: unknown;
  constraints?: Record<string, string>;
  children?: ErrorDeValidacion[];
}

const ausente = (valor: unknown): boolean =>
  valor === undefined ||
  valor === null ||
  (typeof valor === 'string' && valor.trim() === '');

/**
 * ¿Este mensaje lo escribió una persona para esta aplicación?
 *
 * Los de `class-validator` vienen en inglés y con la forma «campo must …». Si
 * alguien puso un `message:` propio, ese manda: sabe más que esta regla.
 */
const esMensajePropio = (texto: string): boolean =>
  !/\bmust\b|\bshould\b/i.test(texto);

export function mensajesDeValidacion(
  errores: ErrorDeValidacion[],
  prefijo = '',
): string[] {
  return errores.flatMap((e) => {
    const ruta = prefijo ? `${prefijo}.${e.property}` : e.property;
    const propios = Object.values(e.constraints ?? {});
    const hijos = e.children?.length
      ? mensajesDeValidacion(e.children, ruta)
      : [];

    let textos: string[];
    if (ausente(e.value) && propios.length > 1) {
      const escritos = propios.filter(esMensajePropio);
      textos = escritos.length
        ? [...new Set(escritos)]
        : [`Falta ${e.property}.`];
    } else {
      textos = [...new Set(propios)];
    }

    return [...textos.map((m) => `${ruta}: ${m}`), ...hijos];
  });
}
