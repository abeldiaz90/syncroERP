/**
 * ============================================================================
 * Una nota que no cabe no puede tirar la operación que la escribe
 * ----------------------------------------------------------------------------
 * `CreditoCliente.notas` es `varchar(500)`, y tres caminos le concatenaban una
 * línea sin medir:
 *
 *   · la devolución de venta         («Ajuste DEV-…»)
 *   · el ajuste por devolución externa de cobranza
 *   · la anulación de venta          («Cancelado por anulación…»)
 *
 * Un crédito con unas cuantas devoluciones pasa de 500 caracteres sin esfuerzo.
 * Y el `save` que revienta no es el primer paso de esas operaciones: es el
 * último. Para cuando Postgres rechaza la fila, el inventario ya se devolvió,
 * la tesorería ya se movió y la póliza ya está encolada. La transacción revierte
 * —eso funciona—, pero quien pulsó el botón recibe un error de base de datos
 * sobre un campo de notas y la operación legítima queda imposible de hacer: se
 * vuelve a intentar y vuelve a fallar, siempre, porque el campo sigue lleno.
 *
 * Un renglón de bitácora no puede ser el motivo por el que no se puede anular
 * una venta. Así que la nota se recorta, y se recorta por el lado VIEJO: lo
 * último es lo que explica el estado de hoy. Queda una marca «…» para que quien
 * lo lea sepa que hubo más y lo busque donde de verdad vive completo, que es la
 * bitácora de auditoría.
 * ============================================================================
 */

/** Lo que admite la columna. Si cambia la entidad, cambia aquí. */
export const LIMITE_NOTAS_CREDITO = 500;

export function anotarEnElCredito(
  notas: string | null | undefined,
  linea: string,
  limite: number = LIMITE_NOTAS_CREDITO,
): string {
  const completa = `${notas ?? ''}\n${linea}`.trim();
  if (completa.length <= limite) return completa;

  const marca = '…\n';
  const cola = completa.slice(-(limite - marca.length));
  /*
   * Se corta en el primer salto de línea de la cola para no dejar media frase
   * colgando: una bitácora que empieza a mitad de un importe se lee peor que
   * una que empieza una línea después.
   */
  const corte = cola.indexOf('\n');
  const limpia = corte >= 0 ? cola.slice(corte + 1) : cola;
  return `${marca}${limpia}`.slice(0, limite);
}
