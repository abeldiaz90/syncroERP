import {
  RolCuentaSistema,
  TipoCuenta,
} from '../entities/cuenta-contable.entity';
import {
  PLAN_CUENTAS_ESTANDAR,
  TOTAL_CUENTAS_SAT_PLAN,
} from './plan-cuentas-estandar';

describe('Plan contable mexicano inicial', () => {
  it('incluye los 1,080 agrupadores y la cuenta técnica de apertura', () => {
    expect(TOTAL_CUENTAS_SAT_PLAN).toBe(1080);
    expect(PLAN_CUENTAS_ESTANDAR).toHaveLength(1081);
    expect(new Set(PLAN_CUENTAS_ESTANDAR.map((c) => c.numeroCuenta)).size).toBe(
      PLAN_CUENTAS_ESTANDAR.length,
    );
  });

  it('conserva jerarquía y sólo vuelve afectables las hojas', () => {
    const porNumero = new Map(
      PLAN_CUENTAS_ESTANDAR.map((cuenta) => [cuenta.numeroCuenta, cuenta]),
    );
    const bancos = porNumero.get('102');
    const bancosNacionales = porNumero.get('102.01');
    expect(bancos?.esAfectable).toBe(false);
    expect(bancosNacionales?.cuentaPadreNumero).toBe('102');
    expect(bancosNacionales?.esAfectable).toBe(true);
    for (const cuenta of PLAN_CUENTAS_ESTANDAR) {
      if (cuenta.cuentaPadreNumero) {
        expect(porNumero.has(cuenta.cuentaPadreNumero)).toBe(true);
      }
    }
  });

  it('asigna roles automáticos sin duplicarlos', () => {
    const roles = PLAN_CUENTAS_ESTANDAR.flatMap((cuenta) =>
      cuenta.rol ? [cuenta.rol] : [],
    );
    expect(new Set(roles).size).toBe(roles.length);
    expect(
      PLAN_CUENTAS_ESTANDAR.find((c) => c.numeroCuenta === '102.01')?.rol,
    ).toBe(RolCuentaSistema.BANCOS);
    expect(
      PLAN_CUENTAS_ESTANDAR.find((c) => c.numeroCuenta === '399-01')?.rol,
    ).toBe(RolCuentaSistema.SALDOS_INICIALES);
  });

  it('separa productos financieros y cuentas de orden', () => {
    expect(
      PLAN_CUENTAS_ESTANDAR.find((c) => c.numeroCuenta === '702.01')?.tipo,
    ).toBe(TipoCuenta.INGRESO);
    expect(
      PLAN_CUENTAS_ESTANDAR.find((c) => c.numeroCuenta === '801.01')?.tipo,
    ).toBe(TipoCuenta.ORDEN);
  });
});
