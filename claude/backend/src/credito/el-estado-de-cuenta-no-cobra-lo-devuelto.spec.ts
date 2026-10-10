/**
 * ============================================================================
 * El estado de cuenta cobraba lo que el ERP ya había devuelto
 * ----------------------------------------------------------------------------
 * Este documento es EL QUE SE LE MANDA AL CLIENTE, y tenía dos defectos:
 *
 * 31 · Tomaba `montoTotal` del crédito y nunca miraba `montoAjustesDevolucion`.
 *      El crédito sí baja su `saldoPendiente` cuando hay una devolución —lo
 *      hacen `devoluciones-ventas` y `cobranza`—, pero el estado de cuenta
 *      seguía cobrando el importe completo. Cobranza perseguía dinero que el
 *      propio ERP había cancelado, con un papel firmado por la empresa.
 *
 * 32 · `new Date(columna date).toISOString()` imprime el día ANTERIOR en
 *      México. El helper `soloFecha` vivía en este mismo archivo desde el
 *      27-sep, con su comentario explicando justo esto, y sólo lo usaban los
 *      renglones de City Ledger.
 * ============================================================================
 */
import { EstadoCuentaService } from './services/estado-cuenta.service';

const EMPRESA = 'empresa-1';
const CLIENTE = 'cliente-1';

/** Una columna `date` llega de la base como Date a medianoche LOCAL. */
const diaDeBase = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};

function armar(ajuste: number) {
  const dataSource: any = {
    query: async (sql: string) => {
      if (/FROM clientes/.test(sql)) return [{ id: CLIENTE, nombre: 'Ferretería del Norte' }];
      if (/FROM creditos_clientes cc\b/.test(sql) && /fechaInicio AS/.test(sql)) {
        return [
          {
            id: 'cre-1',
            folio: 7,
            fechaVenta: diaDeBase('2026-10-01'),
            total: 10000,
            metodoPago: 'SIMPLE',
            ajustesDevolucion: ajuste,
          },
        ];
      }
      if (/FROM pagos_cobranza pc\b/.test(sql)) {
        return [
          {
            id: 'pago-1',
            fechaPago: diaDeBase('2026-10-05'),
            montoPagado: 2000,
            metodoPago: 'EFECTIVO',
            creditoFolio: 'CRD-7',
          },
        ];
      }
      if (/saldoAnterior/.test(sql)) return [{ saldoAnterior: 0 }];
      return [];
    },
  };
  return new EstadoCuentaService(dataSource);
}

describe('Estado de cuenta del cliente', () => {
  it('la devolución aparece como su propio renglón y baja el saldo', async () => {
    const r: any = await armar(1500).obtenerEstadoCuenta(CLIENTE, EMPRESA);
    const devolucion = r.movimientos.find((m: any) => m.tipo === 'DEVOLUCION');
    expect(devolucion).toBeDefined();
    expect(devolucion.abono).toBe(1500);
    // 10,000 de cargo − 1,500 devueltos − 2,000 abonados = 6,500
    expect(r.movimientos[r.movimientos.length - 1].saldo).toBe(6500);
  });

  it('sin devoluciones, no se inventa el renglón', async () => {
    const r: any = await armar(0).obtenerEstadoCuenta(CLIENTE, EMPRESA);
    expect(r.movimientos.some((m: any) => m.tipo === 'DEVOLUCION')).toBe(false);
    expect(r.movimientos[r.movimientos.length - 1].saldo).toBe(8000);
  });

  it('la devolución nunca va por delante del cargo que ajusta', async () => {
    const r: any = await armar(1500).obtenerEstadoCuenta(CLIENTE, EMPRESA);
    const tipos = r.movimientos.map((m: any) => m.tipo);
    expect(tipos.indexOf('DEVOLUCION')).toBeGreaterThan(tipos.indexOf('VENTA'));
    // Y ningún saldo corrido en negativo por un abono adelantado.
    for (const m of r.movimientos) expect(m.saldo).toBeGreaterThanOrEqual(0);
  });

  it('las fechas son el día que fue, no el anterior', async () => {
    const r: any = await armar(0).obtenerEstadoCuenta(CLIENTE, EMPRESA);
    expect(r.movimientos.find((m: any) => m.tipo === 'VENTA').fecha).toBe('2026-10-01');
    expect(r.movimientos.find((m: any) => m.tipo === 'ABONO').fecha).toBe('2026-10-05');
  });
});
