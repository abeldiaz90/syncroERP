/*
 * ============================================================================
 * CONCORDANCIA DE NÚMERO
 * ----------------------------------------------------------------------------
 * «5 producto(s)», «2 mes(es)», «1 acción(es)». El paréntesis no está ahí por
 * el castellano: está porque era más corto que decidir el plural, y la
 * decisión se le pasa a quien lee.
 *
 * MEDIDO el 15-oct-2026 abriendo «Qué le falta» de una empresa en la consola
 * SUMA: «5 producto(s)». La consola ya tenía su pieza y su trinquete, y el
 * portal de Fineract también — pero el texto que la consola enseñaba no era
 * suyo: venía del ERP. La regla estaba puesta en las dos pantallas y faltaba
 * en el único sitio donde se escribe la frase. Es *la pieza buena existe y el
 * camino real no la usa*.
 *
 * Esta es la misma función que `plural` de `frontend/lib/format.ts`, con la
 * misma firma a propósito: una regla que se escribe distinta en el backend y
 * en el frontend es dos reglas.
 * ============================================================================
 */

/**
 * `plural(1, 'registro')` → «1 registro»; con 3, «3 registros».
 *
 * El plural por omisión es añadir «s», que cubre la mayoría; las palabras que
 * no lo siguen —mes, nivel, acción, almacén— pasan el segundo argumento.
 *
 *   plural(2, 'mes', 'meses')            → '2 meses'
 *   plural(1, 'acción', 'acciones')      → '1 acción'
 *   plural(0, 'cuenta activa', 'cuentas activas') → '0 cuentas activas'
 */
export function plural(n: number, singular: string, enPlural?: string): string {
  return `${n} ${n === 1 ? singular : (enPlural ?? singular + 's')}`;
}
