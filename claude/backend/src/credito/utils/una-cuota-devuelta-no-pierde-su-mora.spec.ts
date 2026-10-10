/**
 * ============================================================================
 * Devolver un pago no es dejar la cuota como si nadie hubiera pagado
 * ----------------------------------------------------------------------------
 * `cancelarPago` tenía dos estados donde el enum tiene cuatro:
 *
 *   cuota.estado = pagado >= total ? PAGADA : PENDIENTE
 *
 * Dos pérdidas, en direcciones distintas:
 *
 *  · La cuota que queda con abono PARCIAL volvía a PENDIENTE. `registrarPago`
 *    escribe PAGO_PARCIAL para esa misma situación, así que la misma cuota se
 *    llamaba de dos maneras según por dónde se hubiera llegado. Cobranza lee
 *    ese estado para decidir a quién llama y cuánto le pide.
 *
 *  · Y se perdía la MORA. Una cuota vencida a la que se le cancela el pago
 *    sigue vencida —la fecha no se ha movido—, pero quedaba en PENDIENTE: al
 *    día. Un crédito moroso que se limpia solo cancelando un pago es un
 *    agujero de cartera, no un detalle de etiquetas.
 * ============================================================================
 */
import { EstadoCuota } from '../entities/amortizacion-cuota.entity';
import { estadoDeUnaCuota } from './estado-de-una-cuota.util';

const HOY = new Date('2026-10-10T12:00:00');
const VENCIDA = '2026-09-30';
const POR_VENCER = '2026-11-30';

describe('Estado de una cuota tras devolverle el dinero', () => {
  it('saldada es PAGADA, aunque ya hubiera vencido', () => {
    expect(
      estadoDeUnaCuota({ montoPagado: 1000, montoCuota: 1000, fechaVencimiento: VENCIDA }, HOY),
    ).toBe(EstadoCuota.PAGADA);
  });

  it('con abono parcial y sin vencer es PAGO_PARCIAL, no PENDIENTE', () => {
    expect(
      estadoDeUnaCuota({ montoPagado: 400, montoCuota: 1000, fechaVencimiento: POR_VENCER }, HOY),
    ).toBe(EstadoCuota.PAGO_PARCIAL);
  });

  it('sin nada pagado y sin vencer es PENDIENTE', () => {
    expect(
      estadoDeUnaCuota({ montoPagado: 0, montoCuota: 1000, fechaVencimiento: POR_VENCER }, HOY),
    ).toBe(EstadoCuota.PENDIENTE);
  });

  it('vencida y sin saldar es VENCIDA, con abono o sin él', () => {
    /* Éste es el agujero: las dos caían en PENDIENTE y la mora desaparecía. */
    expect(
      estadoDeUnaCuota({ montoPagado: 0, montoCuota: 1000, fechaVencimiento: VENCIDA }, HOY),
    ).toBe(EstadoCuota.VENCIDA);
    expect(
      estadoDeUnaCuota({ montoPagado: 400, montoCuota: 1000, fechaVencimiento: VENCIDA }, HOY),
    ).toBe(EstadoCuota.VENCIDA);
  });

  it('el orden de las preguntas importa: saldada gana sobre vencida', () => {
    /*
     * Si se preguntara primero por el vencimiento, una cuota que acaba de
     * quedar cubierta se marcaría VENCIDA y cobranza iría a cobrarla otra vez.
     */
    expect(
      estadoDeUnaCuota({ montoPagado: 999.9995, montoCuota: 1000, fechaVencimiento: VENCIDA }, HOY),
    ).toBe(EstadoCuota.PAGADA);
  });

  it('aguanta importes que llegan como texto desde la base', () => {
    expect(
      estadoDeUnaCuota({ montoPagado: '400.00', montoCuota: '1000.00', fechaVencimiento: VENCIDA }, HOY),
    ).toBe(EstadoCuota.VENCIDA);
  });
});
