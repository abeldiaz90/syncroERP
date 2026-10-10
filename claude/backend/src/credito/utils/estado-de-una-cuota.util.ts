import { EstadoCuota } from '../entities/amortizacion-cuota.entity';
import { fechaContableNegocio } from '../../common/utils/business-time.util';

/**
 * ============================================================================
 * En qué estado queda una cuota, dicho una sola vez
 * ----------------------------------------------------------------------------
 * `cancelarPago` tenía dos estados donde el enum tiene cuatro, y perdía
 * información en los dos sentidos:
 *
 *  · Una cuota que queda con abono PARCIAL volvía a `PENDIENTE`, mientras que
 *    `registrarPago` escribe `PAGO_PARCIAL` para esa misma situación. La misma
 *    cuota se llamaba de dos maneras según por dónde se hubiera llegado, y
 *    cobranza lee ese estado para saber a quién llamar y cuánto pedirle.
 *
 *  · Y se perdía la MORA. Si la cuota ya estaba vencida antes del pago que
 *    ahora se cancela, al devolver el dinero sigue vencida —la fecha no se ha
 *    movido—, pero quedaba en `PENDIENTE`: al día. Un crédito moroso que se
 *    limpia solo cancelando un pago es un agujero de cartera.
 *
 * El orden de las preguntas es la regla entera, y por eso vive aquí y no
 * repetida en cada sitio: primero si está saldada, después si ya venció, y al
 * final si queda algo pagado.
 * ============================================================================
 */
export function estadoDeUnaCuota(
  cuota: { montoPagado: number | string; montoCuota: number | string; fechaVencimiento: Date | string },
  ahora: Date = new Date(),
): EstadoCuota {
  const pagado = Number(cuota.montoPagado ?? 0);
  const total = Number(cuota.montoCuota ?? 0);

  if (pagado + 0.001 >= total) return EstadoCuota.PAGADA;
  /*
   * Contra el DÍA y no contra el instante: una cuota que vence hoy no está en
   * mora hasta mañana. Comparar con `ahora` la daba por vencida desde las
   * 00:00:01, que es el mismo defecto que tenía `actualizarVencidos`.
   */
  if (new Date(cuota.fechaVencimiento).getTime() < fechaContableNegocio(ahora).getTime()) {
    return EstadoCuota.VENCIDA;
  }
  return pagado > 0.0001 ? EstadoCuota.PAGO_PARCIAL : EstadoCuota.PENDIENTE;
}
