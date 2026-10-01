/**
 * ============================================================================
 * El folio que la pantalla enseña es el que el documento tiene
 * ----------------------------------------------------------------------------
 * Hasta el 1-oct-2026 cada pantalla armaba el folio por su cuenta: `OC-` más
 * los ocho primeros caracteres del uuid, en mayúsculas, en once lugares
 * distintos. Nadie lo guardaba, así que no se podía dictar por teléfono, no se
 * podía ordenar, y —ocho hexadecimales son 32 bits— no era único: a los
 * ~10,000 documentos dos distintos empiezan a coincidir.
 *
 * Ahora el folio lo reserva el servidor al crear el documento y la pantalla
 * sólo lo muestra. Esta función existe por dos razones:
 *
 *   1. Para que el respaldo —el recorte del uuid— esté escrito UNA vez. Hace
 *      falta porque una instalación puede actualizar el código antes de correr
 *      la migración, y dejar la pantalla en blanco sería cambiar un folio malo
 *      por ninguno.
 *   2. Para que el prefijo viva en un solo lugar. Era parte del defecto
 *      original: la póliza decía `OC-4F3A9C21` y la pantalla también, pero
 *      porque dos archivos distintos armaban la misma cadena a mano.
 * ============================================================================
 */

/** Los prefijos, iguales a los del servidor. */
export const FOLIO = {
  REQUISICION: 'REQ',
  COTIZACION: 'COT',
  ORDEN_COMPRA: 'OC',
  RECEPCION: 'REC',
  PAGO_PROVEEDOR: 'PP',
} as const;

export function folioDe(
  documento: { folio?: string | null; id?: string | null } | null | undefined,
  tipo: string,
): string {
  const guardado = String(documento?.folio ?? '').trim();
  if (guardado) return guardado;
  const id = String(documento?.id ?? '');
  return id ? `${tipo}-${id.slice(0, 8).toUpperCase()}` : `${tipo}-?`;
}
