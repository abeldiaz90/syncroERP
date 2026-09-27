/**
 * ============================================================================
 * Aplazar no es fallar
 * ----------------------------------------------------------------------------
 * Hay rechazos del proveedor que no piden corregir nada, sólo esperar. El más
 * claro: una póliza con fecha posterior a hoy —la nómina fechada el 15 de
 * octubre, corrida en septiembre—. Fineract la rechaza, y hace bien: no se
 * asienta en un periodo que no ha llegado.
 *
 * Tratarlo como fallo gastaba los intentos, dejaba el evento en FALLIDO para
 * siempre y encendía un rojo en «Pólizas sin espejar» que nadie podía apagar
 * —además de bloquear el cierre mensual, que mira esa cola—. Es el mismo error
 * de clasificación que ya costó una vez con los eventos sin destino: meter en
 * el cajón de los errores algo que no es un error.
 *
 * Esto vive aparte del despachador y del outbox porque es una REGLA, no un
 * paso: el reconocimiento del rechazo se prueba solo, y el día que aparezca
 * otro proveedor con otras palabras se añade aquí y nada más.
 * ============================================================================
 */

/**
 * Los textos con los que un proveedor dice «esa fecha todavía no ha llegado».
 *
 * Fineract contesta en inglés y el ERP prefija su propio «Fineract respondió
 * 403: », así que se busca dentro del mensaje, no se compara con él.
 */
const RECHAZOS_POR_FECHA_FUTURA = [
  /journal entry cannot be made for a future date/i,
  /cannot be made for a future date/i,
  /fecha futura/i,
];

/** ¿El proveedor rechazó esto sólo porque la fecha no ha llegado? */
export function esRechazoPorFechaFutura(mensaje: unknown): boolean {
  if (typeof mensaje !== 'string' || !mensaje) return false;
  return RECHAZOS_POR_FECHA_FUTURA.some((r) => r.test(mensaje));
}

/**
 * Cuándo volver a intentarlo: mañana, recién pasada la medianoche local.
 *
 * No se lee la fecha de la póliza a propósito. La condición se resuelve sola
 * con el calendario, así que basta con volver cada día hasta que entre; saber
 * menos es aquí más simple y no puede equivocarse —y el evento no lleva la
 * fecha dentro, sólo el identificador de la póliza—.
 *
 * Cinco minutos pasada la medianoche, no en punto: un reintento clavado en
 * 00:00 corre contra el cambio de día del propio servidor.
 */
export function proximoAmanecer(desde: Date = new Date()): Date {
  const cuando = new Date(
    desde.getFullYear(),
    desde.getMonth(),
    desde.getDate() + 1, // el constructor normaliza el fin de mes solo
    0,
    5,
    0,
    0,
  );
  return cuando;
}
