/**
 * ============================================================================
 * EL IDIOMA DE LA PANTALLA
 * ----------------------------------------------------------------------------
 * QUÉ HABÍA ANTES, Y POR QUÉ NO SERVÍA
 *
 * El ERP tenía selector de idioma en la barra lateral desde hacía semanas, y
 * guardaba la preferencia en el servidor. Lo que no tenía era traducción: `t()`
 * se llamaba en UN archivo —el layout— contra un diccionario de 26 palabras, y
 * devolvía la clave cuando no encontraba nada.
 *
 * O sea que cambiar a inglés traducía medio menú y dejaba las 181 pantallas en
 * español, sin que nada avisara. Es *un control que se cree puesto*, y de los
 * peores: el usuario pidió inglés, el sistema le dijo que sí, y le dio español.
 *
 * MEDIDO el 23-oct-2026 con `herramientas/idioma-extraer.mjs`, que recorre el
 * AST de TypeScript y no el texto: **4,359 textos distintos en 6,243 sitios, y
 * 3 envueltos**. Por eso esto no se arregla a mano ni se declara terminado sin
 * una cuenta: `herramientas/idioma-extraer.mjs` la da, y la prueba del trinquete
 * la congela para que sólo pueda bajar.
 *
 * LAS TRES DECISIONES
 *
 *  1. LA CLAVE ES EL TEXTO EN ESPAÑOL. No se inventan claves (`menu.panel`):
 *     con 6,243 sitios, inventarlas obliga a tocar cada uno dos veces y deja el
 *     código ilegible mientras la traducción no esté. Con el español como clave,
 *     un texto sin traducir se ve en español —que es correcto para la mitad de
 *     los usuarios— y se puede CONTAR, que es lo que importa.
 *
 *  2. EL IDIOMA VIAJA EN COOKIE, no sólo en `localStorage`. De las 189
 *     pantallas del ERP, 10 son de servidor, y una pantalla de servidor no
 *     puede leer un contexto de React. Sin cookie, esas diez se quedaban en
 *     español para siempre y nadie sabría por qué.
 *
 *  3. `traducir` ES UNA FUNCIÓN PURA. El proveedor de React la envuelve para
 *     las pantallas de cliente; las de servidor y los manejadores de ruta la
 *     llaman con el idioma de la cookie. Un solo diccionario, dos caminos.
 * ============================================================================
 */

import { EN_US } from './traducciones/en-US';

export type Idioma = 'es-MX' | 'en-US';

export const IDIOMAS: Array<{ clave: Idioma; nombre: string }> = [
  { clave: 'es-MX', nombre: 'Español' },
  { clave: 'en-US', nombre: 'English' },
];

export const IDIOMA_POR_OMISION: Idioma = 'es-MX';

/** El nombre de la cookie. Lo leen el servidor y el cliente, así que vive aquí. */
export const COOKIE_IDIOMA = 'syncro_idioma';

export const esIdioma = (v: unknown): v is Idioma =>
  v === 'es-MX' || v === 'en-US';

/** Los diccionarios por idioma. El español es la clave: no necesita diccionario. */
const DICCIONARIOS: Record<Idioma, Record<string, string>> = {
  'es-MX': {},
  'en-US': EN_US,
};

/**
 * Los valores que sustituyen a los marcadores.
 *
 * ADMITE NULO, INDEFINIDO Y `false` A PROPÓSITO. El valor que va en un marcador
 * casi siempre viene de datos del servidor —`cliente?.diasCredito`— o de una
 * condición —`tasa > 0 && ' + IVA'`—, así que su tipo real es más ancho que
 * «cadena o número». Prometer lo estrecho obligaba a poner `?? ''` en cada
 * llamada: 15 errores de compilación medidos el 23-oct-2026, y la alternativa
 * honesta es que el tipo diga la verdad y la función decida qué imprimir.
 */
export type DatosDeTexto = Record<string, string | number | boolean | null | undefined>;

/**
 * Traduce un texto, o lo devuelve tal cual.
 *
 * `datos` sustituye marcadores `{nombre}`. Se hace aquí y no interpolando en la
 * llamada porque una frase interpolada no se puede traducir: el orden de las
 * palabras cambia entre idiomas y el español no es la plantilla del inglés.
 *
 *     t('Faltan {n} de {total}', { n: 3, total: 10 })
 *
 * LAS DOS FIRMAS
 *
 * Una cadena entra y sale cadena: eso es lo que necesita un `title=` o un
 * `placeholder=`. Cualquier otra cosa —`string | undefined`, un número, un nodo
 * de React— sale tal como entró, porque traducir no es su trabajo. No es
 * laxitud: es que el texto de pantalla llega a menudo de datos opcionales
 * (`estado?.diagnostico?.mensaje`), y la alternativa era mentir en el tipo o
 * ensuciar 40 llamadas con `?? ''`.
 */
export function traducir(texto: string, idioma: Idioma, datos?: DatosDeTexto): string;
export function traducir<T>(texto: T, idioma: Idioma, datos?: DatosDeTexto): T;
export function traducir(
  texto: unknown,
  idioma: Idioma,
  datos?: DatosDeTexto,
): unknown {
  /*
   * UN VALOR QUE NO ES CADENA PASA DE LARGO.
   *
   * Los textos de las tablas del módulo se envuelven en el SITIO DE RENDER
   * —`{t(item.label)}`— y ahí no siempre llega una cadena: una columna puede
   * traer un número, un `null` o un nodo de React. `texto.trim()` tronaría la
   * pantalla por intentar traducir un 7. Traducir es una mejora; nunca puede
   * ser la causa de una pantalla en blanco.
   */
  if (typeof texto !== 'string') return texto;
  const dic = DICCIONARIOS[idioma] ?? {};
  let salida = dic[texto] ?? dic[texto.trim()] ?? texto;
  if (datos) {
    for (const [clave, valor] of Object.entries(datos)) {
      /*
       * UN VALOR QUE NO HAY, NO SE IMPRIME. `String(undefined)` escribe
       * literalmente «undefined» en la pantalla, y `tasa > 0 && ' + IVA'`
       * escribiría «false» cuando la tasa es cero. Las dos cosas se vieron.
       */
      const impreso = valor === null || valor === undefined || valor === false ? '' : String(valor);
      salida = salida.split(`{${clave}}`).join(impreso);
    }
  }
  return salida;
}

/** ¿Está este texto traducido a este idioma? La usa el trinquete, no la pantalla. */
export const estaTraducido = (texto: string, idioma: Idioma): boolean =>
  idioma === 'es-MX' || Boolean(DICCIONARIOS[idioma]?.[texto.trim()]);

/**
 * El idioma que trae una cadena de cookies.
 *
 * Sirve igual para `document.cookie` en el navegador y para la cabecera
 * `cookie` en el servidor, que es justamente lo que se quería: una sola lectura.
 */
export function idiomaDeCookies(cookies: string | null | undefined): Idioma {
  if (!cookies) return IDIOMA_POR_OMISION;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_IDIOMA}=([^;]+)`).exec(cookies);
  const valor = m ? decodeURIComponent(m[1]) : null;
  return esIdioma(valor) ? valor : IDIOMA_POR_OMISION;
}
