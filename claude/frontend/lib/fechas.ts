/**
 * ============================================================================
 * SyncroERP · Fechas que se imprimen
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * El ticket de una venta a crédito imprimía «Invalid Date» donde va la fecha
 * límite de pago. El comprobante que se le entrega al cliente.
 *
 * La causa es de una línea: cada pantalla se escribía su propio formateador
 * como `new Date(s + 'T00:00:00')`, que sirve para las fechas sin hora que
 * manda el backend (`2026-10-25`) y se rompe con cualquier marca de tiempo
 * completa, porque produce `2026-10-25T13:53:59.167ZT00:00:00`. Hay dieciséis
 * copias de esa línea en el frontend; basta pasarle una fecha con hora a
 * cualquiera para imprimir «Invalid Date» delante de un cliente.
 *
 * Aquí hay una sola función, que acepta las dos formas y que NUNCA imprime
 * «Invalid Date»: si la fecha no se entiende, sale una raya. Un comprobante
 * puede admitir que no sabe una fecha; no puede enseñar un error de
 * JavaScript.
 *
 * Nota sobre el huso: una fecha sin hora se interpreta a mediodía UTC, no a
 * medianoche. Con medianoche, cualquier huso al oeste de Greenwich —el de
 * México— resta horas y el 25 se imprime como 24.
 * ============================================================================
 */

export function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d =
    valor instanceof Date
      ? valor
      : /^\d{4}-\d{2}-\d{2}$/.test(valor)
        ? new Date(`${valor}T12:00:00Z`)
        : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `25 sept 2026`, o `—` si la fecha no se entiende. */
export function fechaCorta(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** `25/09/2026`, o `—`. */
export function fechaNumerica(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** `25 de septiembre de 2026`, o `—`. */
export function fechaLarga(valor: string | Date | null | undefined): string {
  const d = aFecha(valor);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
