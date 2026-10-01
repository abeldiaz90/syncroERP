/**
 * ============================================================================
 * Buscar como teclea la gente
 * ----------------------------------------------------------------------------
 * Medido en la caja el 1-oct-2026, con Abel mirando: «cafe» no devolvía nada y
 * «Café» sí. El producto se llama «Café tostado en grano 1 kg», y nadie escribe
 * el acento con un cliente enfrente. Lo que ve el cajero es que el producto NO
 * EXISTE — el mismo final que ya nos costó una corrección por las mayúsculas,
 * entrando ahora por la tilde.
 *
 * En un catálogo mexicano esto no es un caso raro: café, azúcar, lámina,
 * jabón, limpión, atún, champú, cinturón. Y el que teclea rápido tampoco
 * escribe la diéresis de «cigüeñal» ni la eñe de «niple».
 *
 * `ILike` resolvió las mayúsculas porque Postgres sabe de mayúsculas. De
 * acentos no sabe sin ayuda, así que la ayuda va aquí, y del mismo modo en los
 * dos lados: se compara el texto sin marcas diacríticas contra la columna sin
 * marcas diacríticas.
 *
 * Se hace con `translate` y no con la extensión `unaccent` a propósito:
 * `unaccent` exige instalarla en cada base —y en la del cliente puede no
 * haber permiso—, mientras que `translate` es SQL estándar de Postgres y
 * funciona en cualquier instalación. Una búsqueda que depende de que alguien
 * recuerde instalar una extensión es una búsqueda que un día deja de
 * encontrar la mitad del catálogo sin que nada falle.
 * ============================================================================
 */

/** Letras con marca y su equivalente sin ella. El orden importa: van pareadas. */
const CON_MARCA = 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ';
const SIN_MARCA = 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC';

/* Un desajuste aquí haría que `translate` descartara letras en silencio. */
if (CON_MARCA.length !== SIN_MARCA.length) {
  throw new Error(
    'Las tablas de acentos no están pareadas: translate() descartaría letras.',
  );
}

/**
 * El mismo texto, en minúsculas y sin marcas diacríticas.
 *
 * Usa NFD —descomponer la letra en base + marca— y quita las marcas. Así cubre
 * también lo que viene de un copiar y pegar con acentos combinados, que a la
 * vista es idéntico y como texto no lo es.
 */
export function sinAcentos(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * La expresión SQL que deja una columna comparable con `sinAcentos()`.
 *
 * @param columna referencia de la columna tal como la escribe el query builder
 */
export function columnaSinAcentos(columna: string): string {
  return `translate(lower(${columna}), '${CON_MARCA}', '${SIN_MARCA}')`;
}

/** El patrón `%texto%` ya normalizado, listo para un LIKE. */
export function patronDeBusqueda(texto: string): string {
  return `%${sinAcentos(texto).trim()}%`;
}
