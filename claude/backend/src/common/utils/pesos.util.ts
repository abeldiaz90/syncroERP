/**
 * ============================================================================
 * UN IMPORTE QUE UNA PERSONA LEE VA EN PESOS
 * ----------------------------------------------------------------------------
 * MEDIDO el 13-oct-2026 en la pantalla de conciliacion de cartera. El renglon
 * decia:
 *
 *     Diferencia de -6150.00 sobre una tolerancia de 1.
 *     ERP $0.00 · core $6,150.00
 *
 * Dos lineas, el mismo dinero, dos formatos. El de arriba lo escribio el
 * servidor dentro del mensaje; el de abajo lo formateo la pantalla. Y el de
 * arriba se lee mal a la primera: `-6150.00` puede ser seis mil o seiscientos
 * quince hasta que uno cuenta los digitos, y `1` sin unidad se lee como un
 * conteo, no como un peso.
 *
 * El barrido encontro la misma forma en OCHENTA sitios mas del servidor:
 * «El cliente tiene 6150.00 vencidos», «el maximo a pagar ahora es 23400.00»,
 * «Facturan a 1250.00 y lo pactado fue 1180.00». Son mensajes que se leen en
 * el momento de decidir si se paga, si se aprueba o si se cancela.
 *
 * ── POR QUE AQUI Y NO EN CADA SERVICIO ─────────────────────────────────────
 * Porque ya paso: la pantalla contaba dias naturales y el servidor laborables.
 * Un formato de dinero escrito a mano en ochenta sitios es ochenta sitios donde
 * un dia alguien pone el punto donde va la coma.
 *
 * ── POR QUE NO SE MIGRARON LOS OCHENTA DE GOLPE ────────────────────────────
 * Porque muchos de esos textos estan fijados LETRA POR LETRA en las pruebas, y
 * cambiarlos todos en una madrugada a dias de produccion son ochenta cirugias
 * cuyo resultado no se puede medir de una vez. Se hace lo que se puede
 * hacer bien: la pieza compartida, los sitios que se tocan por otro motivo, y
 * un numero que solo puede bajar —`un-importe-se-lee-en-pesos.spec.ts`—.
 *
 * ── LA MONEDA ──────────────────────────────────────────────────────────────
 * Pesos mexicanos, porque es la moneda del ERP y no hay otra en el sistema. El
 * dia que haya una segunda, esta funcion recibira la moneda como argumento y el
 * compilador dira exactamente que sitios hay que mirar. Eso es justo lo que no
 * puede hacer un `toFixed(2)` escrito a mano.
 * ============================================================================
 */

const FORMATO = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Un importe tal y como debe aparecer dentro de un texto que lee una persona:
 * `$6,150.00`.
 *
 * Un valor que no es un numero devuelve `$0.00` y no `$NaN`: en un mensaje,
 * `NaN` no informa de nada y asusta. Quien necesite distinguir «no hay dato» de
 * «cero» tiene que decirlo con palabras, que es lo honesto, y no delegarlo en
 * un formato.
 */
export function pesos(valor: number | string | null | undefined): string {
  const n = Number(valor);
  return FORMATO.format(Number.isFinite(n) ? n : 0);
}
