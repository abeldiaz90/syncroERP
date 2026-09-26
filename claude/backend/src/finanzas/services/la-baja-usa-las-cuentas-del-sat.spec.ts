import { Logger } from '@nestjs/common';
import { MotorContableService } from './motor-contable.service';

/**
 * ============================================================================
 * La utilidad en venta de un activo fijo no es «Otros ingresos»
 * ----------------------------------------------------------------------------
 * Medido el 26-sep-2026: se vendió la camioneta AF-000001 —$480,000 de costo,
 * $20,000 depreciados, vendida en $500,000— y la póliza quedó así:
 *
 *   101.01 Caja                        D 500,000
 *   171.03 Depreciación acumulada      D  20,000
 *   154.01 Automóviles…                            H 480,000
 *   403.01 Otros Ingresos                          H  40,000
 *
 * Cuadra, y el último renglón está en la cuenta equivocada. El catálogo SAT
 * tiene familias propias para esto, y la contabilidad electrónica se presenta
 * por CÓDIGO AGRUPADOR:
 *
 *   · 704.01 … 704.18 «Ganancia en venta y/o baja de …», una por tipo de
 *     activo. La de automóviles es la 704.04.
 *   · 505.01 «Costo por venta de activo fijo» y 505.02 «Costo por baja de
 *     activo fijo» para la pérdida.
 *
 * Con «Otros ingresos» el XML mensual obliga a explicar a mano de dónde salió
 * esa ganancia. Con la 704.04 lo dice él solo.
 *
 * La regla de siempre se conserva por debajo: si el catálogo de la empresa no
 * tiene la cuenta específica se usa la genérica, y si tampoco, el rol. Un
 * activo vendido tiene que poder darse de baja.
 * ============================================================================
 */

const PORTADA: Record<string, any> = {
  '151.01': { id: 'cta-terrenos', codigoAgrupadorSAT: '151.01' },
  '154.01': { id: 'cta-automoviles', codigoAgrupadorSAT: '154.01' },
  '156.01': { id: 'cta-computo', codigoAgrupadorSAT: '156.01' },
  '704.04': { id: 'cta-ganancia-autos', codigoAgrupadorSAT: '704.04' },
  '704.06': { id: 'cta-ganancia-computo', codigoAgrupadorSAT: '704.06' },
  '704.23': { id: 'cta-ganancia-otros', codigoAgrupadorSAT: '704.23' },
  '505.01': { id: 'cta-costo-venta-af', codigoAgrupadorSAT: '505.01' },
  '505.02': { id: 'cta-costo-baja-af', codigoAgrupadorSAT: '505.02' },
};

const CUENTAS_POR_ROL: Record<string, any> = {
  CAJA: { id: 'cta-caja', numeroCuenta: '101.01' },
  OTROS_INGRESOS: { id: 'cta-otros-ingresos', numeroCuenta: '403.01' },
  OTROS_GASTOS: { id: 'cta-otros-gastos', numeroCuenta: '703.01' },
};

interface PolizaGuardada {
  poliza: any;
  partidas: Array<{ cuentaContableId: string; cargo: number; abono: number }>;
}

function crearArnes(sinCuentas: string[] = []) {
  const guardadas: PolizaGuardada[] = [];

  const repoCuentas: any = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) {
        return (
          Object.values(PORTADA).find((c: any) => c.id === where.id) ?? null
        );
      }
      const codigo = where.codigoAgrupadorSAT;
      if (sinCuentas.includes(codigo)) return null;
      return PORTADA[codigo] ?? null;
    }),
    createQueryBuilder: () => {
      const filtros: Record<string, any> = {};
      const qb: any = {
        where: (_: string, p: any) => (Object.assign(filtros, p), qb),
        andWhere: (_: string, p: any) => (Object.assign(filtros, p), qb),
        orderBy: () => qb,
        getOne: async () =>
          filtros.rol ? (CUENTAS_POR_ROL[filtros.rol] ?? null) : null,
      };
      return qb;
    },
  };

  const manager: any = {
    create: (_e: any, v: any) => v,
    findOne: jest.fn(async () => null),
    getRepository: () => repoCuentas,
    save: jest.fn(async (entidad: any, valor?: any) => {
      const v = valor ?? entidad;
      if (Array.isArray(v)) {
        guardadas[guardadas.length - 1].partidas = v;
        return v;
      }
      if (v?.concepto) {
        guardadas.push({ poliza: { ...v, id: 'pol-1' }, partidas: [] });
        return { ...v, id: 'pol-1' };
      }
      return v;
    }),
    query: jest.fn(async () => []),
  };

  const dataSource: any = {
    getRepository: () => repoCuentas,
    query: jest.fn(async (sql: string) => {
      if (String(sql).includes('cierres_contables')) return [];
      return [];
    }),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (String(sql).includes('pg_advisory_xact_lock')) {
          return [{ resultado: 0 }];
        }
        return [];
      }),
      manager,
    }),
  };

  const servicio = new MotorContableService(dataSource, {} as any);
  return { servicio, guardadas };
}

const baja = (extra: Partial<any> = {}) => ({
  activoId: 'af-1',
  empresaId: 'e1',
  fecha: new Date('2026-09-26'),
  codigo: 'AF-000001',
  nombre: 'Camioneta de reparto',
  motivo: 'VENTA',
  costoAdquisicion: 480000,
  depreciacionAcumulada: 20000,
  valorVenta: 500000,
  cuentaActivoId: 'cta-automoviles',
  cuentaDepreciacionAcumuladaId: 'cta-dep-autos',
  ...extra,
});

/** El invariante de la partida doble. */
function esperarCuadre(p: PolizaGuardada) {
  const cargos = p.partidas.reduce((s, x) => s + Number(x.cargo), 0);
  const abonos = p.partidas.reduce((s, x) => s + Number(x.abono), 0);
  expect(Math.round(cargos * 100)).toBe(Math.round(abonos * 100));
}

describe('Baja de activo · las cuentas del catálogo SAT', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('la ganancia al vender un automóvil va a la 704.04', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeBajaActivo(baja());

    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cuentaContableId: 'cta-ganancia-autos',
          abono: 40000,
        }),
      ]),
    );
    expect(
      guardadas[0].partidas.some(
        (p) => p.cuentaContableId === 'cta-otros-ingresos',
      ),
    ).toBe(false);
  });

  it('cada tipo de activo lleva su propia cuenta de ganancia', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeBajaActivo(
      baja({ cuentaActivoId: 'cta-computo' }),
    );

    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-ganancia-computo' }),
      ]),
    );
  });

  it('la pérdida en una VENTA va al costo por venta de activo fijo', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeBajaActivo(baja({ valorVenta: 400000 }));

    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cuentaContableId: 'cta-costo-venta-af',
          cargo: 60000,
        }),
      ]),
    );
  });

  it('la pérdida en una BAJA sin venta va al costo por baja', async () => {
    // Obsolescencia, siniestro, robo: no hay venta, hay retiro.
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeBajaActivo(
      baja({ motivo: 'OBSOLESCENCIA', valorVenta: 0 }),
    );

    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cuentaContableId: 'cta-costo-baja-af',
          cargo: 460000,
        }),
      ]),
    );
  });

  it('sin la cuenta específica usa la genérica del SAT', async () => {
    const { servicio, guardadas } = crearArnes(['704.04']);
    await servicio.generarAsientoDeBajaActivo(baja());

    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-ganancia-otros' }),
      ]),
    );
  });

  it('sin ninguna de las dos, la baja no se detiene', async () => {
    /*
     * Un activo vendido tiene que poder darse de baja: se cae al rol de
     * siempre antes que dejar la operación sin contabilizar.
     */
    const { servicio, guardadas } = crearArnes(['704.04', '704.23']);
    await servicio.generarAsientoDeBajaActivo(baja());

    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-otros-ingresos' }),
      ]),
    );
  });
});
