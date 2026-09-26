import { PLAN_CUENTAS_ESTANDAR } from './plan-cuentas-estandar';

/**
 * ============================================================================
 * Las complementarias van al revés de su tipo
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La naturaleza de cada cuenta se derivaba sólo del TIPO: activo y costo,
 * deudoras; pasivo, capital e ingreso, acreedoras. Es cierto salvo para las
 * cuentas complementarias, que son del mismo tipo que la cuenta que corrigen y
 * llevan la naturaleza contraria: la depreciación acumulada es de ACTIVO con
 * saldo ACREEDOR, y las devoluciones sobre ventas son de INGRESO con saldo
 * DEUDOR.
 *
 * 66 cuentas del catálogo SAT quedaron declaradas al revés.
 *
 * Se descubrió por una comprobación nueva del tablero de integridad —«cuentas
 * cuyo saldo va al revés de su naturaleza»—, que es lo primero que mira un
 * contador en una balanza y que el ERP no miraba. La primera vez que corrió
 * señaló, entre otras, «Depreciación acumulada de mobiliario» con −450: un
 * activo en negativo donde debía haber 450 acreedores.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que las ocho familias complementarias del catálogo conserven la naturaleza
 * contraria a su tipo, y que las demás cuentas sigan la regla normal. Es una
 * prueba sobre datos, no sobre código: el catálogo se regenera y una regla
 * nueva puede volver a aplanarlo sin que nada más se entere.
 * ============================================================================
 */

const COMPLEMENTARIAS_DE_ACTIVO = ['108', '116', '171', '172', '183', '189'];

const raiz = (codigo: string) => codigo.split(/[.-]/)[0];

describe('Catálogo · las cuentas complementarias van al revés de su tipo', () => {
  const porRaiz = (r: string) =>
    PLAN_CUENTAS_ESTANDAR.filter((c) => raiz(c.numeroCuenta) === r);

  it('las estimaciones y las acumuladas son acreedoras', () => {
    const malas: string[] = [];
    for (const r of COMPLEMENTARIAS_DE_ACTIVO) {
      const cuentas = porRaiz(r);
      expect(cuentas.length).toBeGreaterThan(0);
      for (const c of cuentas) {
        if (c.naturaleza !== 'ACREEDORA') {
          malas.push(`${c.numeroCuenta} ${c.nombre} → ${c.naturaleza}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });

  it('las devoluciones sobre ventas son deudoras', () => {
    const cuentas = porRaiz('402');
    expect(cuentas.length).toBeGreaterThan(0);
    expect(cuentas.filter((c) => c.naturaleza !== 'DEUDORA')).toEqual([]);
  });

  it('las devoluciones sobre compras son acreedoras', () => {
    const cuentas = porRaiz('503');
    expect(cuentas.length).toBeGreaterThan(0);
    expect(cuentas.filter((c) => c.naturaleza !== 'ACREEDORA')).toEqual([]);
  });

  it('las contra cuentas de orden compensan a su par', () => {
    const contras = PLAN_CUENTAS_ESTANDAR.filter(
      (c) => c.numeroCuenta.startsWith('8') && /^contra cuenta/i.test(c.nombre),
    );
    expect(contras.length).toBeGreaterThan(0);
    expect(contras.filter((c) => c.naturaleza !== 'ACREEDORA')).toEqual([]);
  });

  it('el resto del catálogo sigue la regla normal', () => {
    /*
     * Para que el arreglo de arriba no se convierta en «todo es acreedor»:
     * inventario, bancos, clientes y los gastos siguen siendo deudores.
     */
    const deudorasEsperadas = ['101', '102', '105', '115', '118', '601'];
    const malas: string[] = [];
    for (const r of deudorasEsperadas) {
      for (const c of porRaiz(r)) {
        if (c.naturaleza !== 'DEUDORA') {
          malas.push(`${c.numeroCuenta} ${c.nombre} → ${c.naturaleza}`);
        }
      }
    }
    const acreedorasEsperadas = ['201', '213', '301', '401'];
    for (const r of acreedorasEsperadas) {
      for (const c of porRaiz(r)) {
        if (c.naturaleza !== 'ACREEDORA') {
          malas.push(`${c.numeroCuenta} ${c.nombre} → ${c.naturaleza}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });
});
