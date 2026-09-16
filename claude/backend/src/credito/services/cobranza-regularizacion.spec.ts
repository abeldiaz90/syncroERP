import { EstadoCuota } from '../entities/amortizacion-cuota.entity';
import { EstadoCredito } from '../entities/credito-cliente.entity';

/**
 * ============================================================================
 * `actualizarVencidos` · el camino de vuelta
 * ----------------------------------------------------------------------------
 * El método sólo escalaba: marcaba VENCIDO y no desmarcaba nunca. El único
 * regreso a ACTIVO era registrar un pago, así que un cliente que dejaba de
 * estar en mora por cualquier otra vía —cuota reprogramada, fecha corregida,
 * devolución que baja el saldo— se quedaba contado como moroso para siempre.
 *
 * Lo que se prueba aquí no es el SQL, que lo prueba la base: es la REGLA. Que
 * se regularice a quien ya no tiene cuotas vencidas, y que no se toquen los
 * estados finales, que es el error fácil de cometer al escribir la vuelta.
 * ============================================================================
 */
describe('actualizarVencidos · regularización', () => {
  /** Reproduce la condición del filtro, que es lo que decide a quién se toca. */
  const seRegulariza = (credito: {
    estado: EstadoCredito;
    cuotas: { estado: EstadoCuota; vencimiento: string }[];
  }, hoy = '2026-09-16') =>
    credito.estado === EstadoCredito.VENCIDO &&
    !credito.cuotas.some(
      (q) => q.estado !== EstadoCuota.PAGADA && q.vencimiento < hoy,
    );

  it('devuelve a ACTIVO a un crédito VENCIDO cuyas cuotas ya están al corriente', () => {
    expect(
      seRegulariza({
        estado: EstadoCredito.VENCIDO,
        cuotas: [
          { estado: EstadoCuota.PAGADA, vencimiento: '2026-08-15' },
          { estado: EstadoCuota.PENDIENTE, vencimiento: '2026-11-14' },
        ],
      }),
    ).toBe(true);
  });

  it('no toca a quien sigue con una cuota vencida sin pagar', () => {
    expect(
      seRegulariza({
        estado: EstadoCredito.VENCIDO,
        cuotas: [{ estado: EstadoCuota.VENCIDA, vencimiento: '2026-08-15' }],
      }),
    ).toBe(false);
  });

  it('una cuota vieja pero PAGADA no lo mantiene en mora', () => {
    expect(
      seRegulariza({
        estado: EstadoCredito.VENCIDO,
        cuotas: [{ estado: EstadoCuota.PAGADA, vencimiento: '2020-01-01' }],
      }),
    ).toBe(true);
  });

  /*
   * El error fácil al escribir la vuelta: regularizar por «no tiene cuotas
   * vencidas» sin mirar el estado del crédito. LIQUIDADO y CANCELADO son
   * finales; reabrirlos a ACTIVO resucitaría créditos cerrados.
   */
  it('no resucita un crédito LIQUIDADO', () => {
    expect(
      seRegulariza({
        estado: EstadoCredito.LIQUIDADO,
        cuotas: [{ estado: EstadoCuota.PAGADA, vencimiento: '2026-01-01' }],
      }),
    ).toBe(false);
  });

  it('no resucita un crédito CANCELADO', () => {
    expect(
      seRegulariza({
        estado: EstadoCredito.CANCELADO,
        cuotas: [],
      }),
    ).toBe(false);
  });

  it('un crédito ACTIVO sin mora no se reprocesa', () => {
    expect(
      seRegulariza({
        estado: EstadoCredito.ACTIVO,
        cuotas: [{ estado: EstadoCuota.PENDIENTE, vencimiento: '2026-12-01' }],
      }),
    ).toBe(false);
  });
});
