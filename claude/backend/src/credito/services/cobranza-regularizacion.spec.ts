import { EstadoCuota } from '../entities/amortizacion-cuota.entity';
import { EstadoCredito } from '../entities/credito-cliente.entity';
import { seRegulariza } from '../utils/un-credito-se-regulariza.util';

/**
 * ============================================================================
 * `actualizarVencidos` · el camino de vuelta
 * ----------------------------------------------------------------------------
 * El método sólo escalaba: marcaba VENCIDO y no desmarcaba nunca. El único
 * regreso a ACTIVO era registrar un pago, así que un cliente que dejaba de
 * estar en mora por cualquier otra vía —cuota reprogramada, fecha corregida,
 * devolución que baja el saldo— se quedaba contado como moroso para siempre.
 *
 * ── Y ESTA PRUEBA ERA EL HALLAZGO 52 ───────────────────────────────────────
 *
 * Hasta el 10-oct-2026 esto definía la condición DENTRO del propio test —una
 * función `seRegulariza` local de cuatro líneas— y no llamaba al servicio
 * nunca. O sea que afirmaba sobre una COPIA de la regla: si la del servicio
 * cambiaba, la prueba seguía verde midiendo la otra. Es la misma lección que la
 * aserción dentro de un `catch` que se la traga, y que la prueba de la dotación
 * que comprobaba `toContain('costoConsumos')`: **una prueba que no puede fallar
 * es peor que no tenerla**, porque afirma que algo está vigilado.
 *
 * La regla se mudó a `utils/un-credito-se-regulariza`, el servicio la usa como
 * confirmación sobre las filas que el `NOT EXISTS` ya seleccionó, y esto la
 * importa. Ahora un cambio en la regla llega hasta aquí.
 * ============================================================================
 */
const HOY = new Date(2026, 8, 16); // 16-sep-2026, a medianoche local
const cuota = (estado: EstadoCuota, vencimiento: string) => ({
  estado,
  fechaVencimiento: new Date(`${vencimiento}T00:00:00`),
});

describe('actualizarVencidos · regularización', () => {
  it('devuelve a ACTIVO a un crédito VENCIDO cuyas cuotas ya están al corriente', () => {
    expect(
      seRegulariza(
        {
          estado: EstadoCredito.VENCIDO,
          cuotas: [
            cuota(EstadoCuota.PAGADA, '2026-08-15'),
            cuota(EstadoCuota.PENDIENTE, '2026-11-14'),
          ],
        },
        HOY,
      ),
    ).toBe(true);
  });

  it('no toca a quien sigue con una cuota vencida sin pagar', () => {
    expect(
      seRegulariza(
        {
          estado: EstadoCredito.VENCIDO,
          cuotas: [cuota(EstadoCuota.VENCIDA, '2026-08-15')],
        },
        HOY,
      ),
    ).toBe(false);
  });

  it('una cuota vieja pero PAGADA no lo mantiene en mora', () => {
    expect(
      seRegulariza(
        {
          estado: EstadoCredito.VENCIDO,
          cuotas: [cuota(EstadoCuota.PAGADA, '2020-01-01')],
        },
        HOY,
      ),
    ).toBe(true);
  });

  it('una cuota PARCIAL vencida sigue siendo mora', () => {
    /*
     * El error fácil al escribir la vuelta: regularizar por «no tiene cuotas
     * VENCIDAS» mirando el estado en vez de la fecha. Una cuota con abono
     * parcial y vencimiento pasado no está marcada VENCIDA mientras el cron no
     * pase, y sí es mora.
     */
    expect(
      seRegulariza(
        {
          estado: EstadoCredito.VENCIDO,
          cuotas: [cuota(EstadoCuota.PAGO_PARCIAL, '2026-08-15')],
        },
        HOY,
      ),
    ).toBe(false);
  });

  it('los estados finales no se reabren', () => {
    for (const estado of [EstadoCredito.LIQUIDADO, EstadoCredito.CANCELADO]) {
      expect(seRegulariza({ estado, cuotas: [] }, HOY)).toBe(false);
    }
  });

  it('un crédito ACTIVO no se "regulariza": ya lo está', () => {
    expect(seRegulariza({ estado: EstadoCredito.ACTIVO, cuotas: [] }, HOY)).toBe(false);
  });

  it('la cuota que vence HOY no mantiene la mora', () => {
    /*
     * Misma frontera que el hallazgo 27: al cliente le queda el día entero para
     * pagar. Medir contra el instante lo dejaría moroso desde las 00:00:01.
     */
    expect(
      seRegulariza(
        {
          estado: EstadoCredito.VENCIDO,
          cuotas: [cuota(EstadoCuota.PENDIENTE, '2026-09-16')],
        },
        HOY,
      ),
    ).toBe(true);
  });

  it('sin cuotas cargadas no inventa mora', () => {
    expect(seRegulariza({ estado: EstadoCredito.VENCIDO }, HOY)).toBe(true);
  });
});
