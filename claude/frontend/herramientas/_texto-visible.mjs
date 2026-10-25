/**
 * QUÉ ES TEXTO Y QUÉ ES MAQUINARIA — UNA SOLA VEZ.
 *
 * Esta regla vivía copiada en `idioma-envolver.mjs` y en `idioma-partidas.mjs`.
 * Las dos copias YA habían divergido: la de partidas no conocía la regla de
 * `CLAVE_DE_ENUM`. Es el tercer caso de la misma avería en esta tanda (el
 * enganche por archivo contra por componente, y la `t` tapada en
 * `idioma-desensombrar` contra `tTapada`): escribir la regla dos veces y que
 * una copia se quede corta. Así que ahora se escribe aquí y se importa.
 *
 * Al unificarlas, partidas hereda la regla de enum. No se pierde ninguna
 * traducción por eso: lo que deja de listar son tokens como
 * `LIABILITY_TRANSFER`, que son nombres del core y no frases.
 */

/**
 * CSS DENTRO DE JSX. Una regla de estilo tiene letras y espacios y parece una
 * frase. Traducirla no cambia el idioma de nada: rompe la impresión del ticket.
 *
 * De las dos copias que había, la de `idioma-envolver.mjs` conocía cuatro
 * señales y la de `idioma-partidas.mjs` sólo una. Se conserva la fuerte.
 */
export const PARECE_CSS = (t) =>
  /[{}]/.test(t) ||
  /^@(?:media|keyframes|page|supports|import|font-face)\b/.test(t) ||
  /\b(?:rgb|rgba|hsl|hsla|var|calc|url)\(/.test(t) ||
  /^[\d.]+(?:px|rem|em|vh|vw|%)\b/.test(t);

/**
 * UNA RUTA NO SE TRADUCE.
 *
 * `/api/v1/offices` se muestra en pantalla, dentro de un `<span class="mono">`,
 * como la ruta real del core sobre la que opera la pantalla. Es texto visible y
 * tiene letras, así que la prueba permisiva lo aceptaba y lo envolvía en `t()`.
 *
 * Dos daños, los dos medidos el 23-oct-2026:
 *
 *  1. La ruta entró al diccionario como si fuera una frase, y la traducción
 *     inglesa de una ruta es la misma ruta: ruido que alguien tiene que revisar.
 *  2. `pruebas/ninguna-pantalla-llama-a-una-ruta-que-no-existe.test.ts` lee las
 *     CADENAS del código buscando rutas, y una ruta que antes era un nodo de
 *     texto de JSX pasó a ser una cadena. La prueba acusó a tres pantallas de
 *     pedir `/api/v1/...` al BFF. No era verdad, pero la prueba hacía bien en
 *     mirar ahí: el que estaba mal era el codemod.
 *
 * La señal es que empieza por `/` y no tiene espacios. Una frase que empiece
 * por barra y no lleve ni un espacio no existe.
 */
export const PARECE_RUTA = (t) => /^\/[^\s]*$/.test(t);

export const esTextoVisible = (s) => {
  const t = s.trim();
  if (t.length < 2 || !/[a-zA-Z]/.test(t)) return false;
  if (PARECE_CSS(t)) return false;
  if (/^https?:|^\/\/|^@\/|^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (PARECE_RUTA(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3) return false;   // CLAVE_DE_ENUM
  return true;
};

/**
 * UNA CADENA, NO UN NODO DE TEXTO.
 *
 * Para un nodo de texto JSX la prueba permisiva es correcta: está entre dos
 * etiquetas, o sea que se lee, y por eso «esc», «abrir» y «capturado» —una
 * palabra, en minúsculas— sí se traducen.
 *
 * Una CADENA es otra cosa. `'almacenId'`, `'apellidoPaterno'`, `'cantidad'`:
 * 209 de las 815 que el modo permisivo proponía en el ERP eran nombres de campo
 * de formulario y claves de payload, medidas el 23-oct-2026. Una palabra sola
 * sin espacios, en minúsculas o camelCase, dentro de una cadena, es un nombre
 * de campo mucho más a menudo que una etiqueta; y equivocarse aquí no deja un
 * texto sin traducir: manda al servidor una clave traducida.
 */
export const esTextoEnCadena = (s) => {
  const t = s.trim();
  if (!esTextoVisible(t)) return false;
  if (!/\s/.test(t) && /^[a-z][a-zA-Z0-9_]*$/.test(t)) return false;
  /* `'PATCH /catalogo/wms/transferencias/:id/enviar'` tiene letras y espacios y
     no es texto: es la acción que se consulta contra los permisos. */
  if (/^(?:GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\s+\//.test(t)) return false;
  /*
   * LISTAS DE CLASES. `'bg-white text-slate-800 border-slate-200'` tiene
   * espacios, así que la regla de la palabra sola no la ataja, y tiene letras,
   * así que parece texto. Son cinco en el ERP, medidas el 23-oct-2026, y
   * traducirlas no deja una frase sin traducir: deja un botón sin color.
   *
   * La señal es que CADA palabra lleva guion o dos puntos y ninguna mayúscula
   * ni acento: así se escribe una clase y así no se escribe una frase.
   */
  if (!/[A-ZÁÉÍÓÚÑ]/.test(t) && t.split(/\s+/).every((w) => /[-:]/.test(w) && /^[a-z0-9]/.test(w))) return false;
  if (/^_[a-z]+$/.test(t)) return false;                       // `_blank`
  if (/^[A-Za-z]+(?:_[A-Za-z]+)+$/.test(t)) return false;      // `Inventario_Valorizado`
  return true;
};
