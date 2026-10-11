/**
 * ============================================================================
 * A qué centro pertenece una partida
 * ----------------------------------------------------------------------------
 * La dimensión que le faltaba al mayor. `PartidaPoliza` tenía cuenta, cargo y
 * abono: con eso se puede contestar «cuánto gasté en papelería» y no «cuánto
 * costó el hotel contra cuánto costó la ferretería».
 *
 * La regla vive en un solo sitio porque las pólizas nacen por tres caminos, y
 * el tercero es el que se olvida — es exactamente lo que pasó con el control de
 * «la póliza no puede ser de fecha futura», que se creía puesto en todos y
 * cubría la minoría.
 * ============================================================================
 */
import { BadRequestException } from '@nestjs/common';

import { TipoCuenta } from '../entities/cuenta-contable.entity';
import { centroDeLaPartida, laEmpresaLlevaCentros } from './el-centro-de-la-partida';

const EMPRESA = 'empresa-1';

function em(opciones: {
  centros?: any[];
  cuantosActivos?: number;
}) {
  const centros = opciones.centros ?? [];
  return {
    getRepository: () => ({
      count: async () => opciones.cuantosActivos ?? centros.length,
      findOne: async ({ where }: any) =>
        centros.find((c) => c.id === where.id && c.empresaId === where.empresaId) ?? null,
    }),
  } as any;
}

const CENTRO_BUENO = {
  id: 'cc-1',
  empresaId: EMPRESA,
  nombre: 'Ferretería Centro',
  activo: true,
  aceptaMovimientos: true,
};

describe('¿Esta empresa lleva centros de costo?', () => {
  it('los lleva cuando tiene alguno activo que acepte movimientos', async () => {
    expect(await laEmpresaLlevaCentros(em({ cuantosActivos: 3 }), EMPRESA)).toBe(true);
  });

  it('y no los lleva cuando no tiene ninguno', async () => {
    /*
     * No hay interruptor: el catálogo ES la respuesta. Una bandera aparte sería
     * un segundo estado que puede contradecir al primero, y alguien tendría que
     * mantener los dos de acuerdo. Mismo criterio que las posiciones de almacén.
     */
    expect(await laEmpresaLlevaCentros(em({ cuantosActivos: 0 }), EMPRESA)).toBe(false);
  });
});

describe('Cuentas de resultado · lo exigen cuando la empresa lleva centros', () => {
  for (const tipo of [TipoCuenta.INGRESO, TipoCuenta.COSTO, TipoCuenta.GASTO]) {
    it(`${tipo} sin centro, con catálogo: se niega`, async () => {
      await expect(
        centroDeLaPartida(em({ cuantosActivos: 1 }), EMPRESA, {
          tipoCuenta: tipo,
          cuenta: '601.01 Papelería',
          llevaCentros: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it(`${tipo} sin centro y SIN catálogo: pasa, porque esa empresa no los usa`, async () => {
      expect(
        await centroDeLaPartida(em({ cuantosActivos: 0 }), EMPRESA, {
          tipoCuenta: tipo,
          llevaCentros: false,
        }),
      ).toBeNull();
    });
  }

  it('la negativa dice QUÉ cuenta y POR QUÉ, no «campo requerido»', async () => {
    await expect(
      centroDeLaPartida(em({ cuantosActivos: 1 }), EMPRESA, {
        tipoCuenta: TipoCuenta.GASTO,
        cuenta: '601.01 Papelería',
        llevaCentros: true,
      }),
    ).rejects.toThrow(/601\.01 Papelería[\s\S]*no suma el total/);
  });
});

describe('Cuentas de balance · no lo exigen nunca', () => {
  for (const tipo of [TipoCuenta.ACTIVO, TipoCuenta.PASIVO, TipoCuenta.CAPITAL, TipoCuenta.ORDEN]) {
    it(`${tipo} pasa sin centro aunque la empresa los lleve`, async () => {
      /*
       * El saldo de un banco o el IVA por cobrar no son de la sucursal norte.
       * Exigirlo aquí acabaría con todo el activo clasificado en un centro
       * inventado llamado «general», que es ruido con aspecto de dato.
       */
      expect(
        await centroDeLaPartida(em({ cuantosActivos: 5 }), EMPRESA, {
          tipoCuenta: tipo,
          llevaCentros: true,
        }),
      ).toBeNull();
    });
  }
});

describe('El centro que se manda tiene que servir', () => {
  it('uno bueno se acepta y se devuelve', async () => {
    expect(
      await centroDeLaPartida(em({ centros: [CENTRO_BUENO], cuantosActivos: 1 }), EMPRESA, {
        centroCostoId: 'cc-1',
        tipoCuenta: TipoCuenta.GASTO,
        llevaCentros: true,
      }),
    ).toBe('cc-1');
  });

  it('uno de OTRA empresa se niega', async () => {
    const ajeno = { ...CENTRO_BUENO, empresaId: 'otra-empresa' };
    await expect(
      centroDeLaPartida(em({ centros: [ajeno], cuantosActivos: 1 }), EMPRESA, {
        centroCostoId: 'cc-1',
        tipoCuenta: TipoCuenta.GASTO,
        llevaCentros: true,
      }),
    ).rejects.toThrow(/otra empresa/);
  });

  it('uno desactivado se niega', async () => {
    await expect(
      centroDeLaPartida(
        em({ centros: [{ ...CENTRO_BUENO, activo: false }], cuantosActivos: 1 }),
        EMPRESA,
        { centroCostoId: 'cc-1', tipoCuenta: TipoCuenta.GASTO, llevaCentros: true },
      ),
    ).rejects.toThrow(/desactivado/);
  });

  it('un centro ACUMULADOR se niega, y dice qué hacer', async () => {
    /*
     * Misma regla que las cuentas de mayor, por la misma razón: si un
     * acumulador recibe movimientos propios, su saldo deja de ser la suma de
     * sus hijos y el reporte por centro ya no cuadra con el total.
     */
    await expect(
      centroDeLaPartida(
        em({ centros: [{ ...CENTRO_BUENO, aceptaMovimientos: false }], cuantosActivos: 1 }),
        EMPRESA,
        { centroCostoId: 'cc-1', tipoCuenta: TipoCuenta.GASTO, llevaCentros: true },
      ),
    ).rejects.toThrow(/cuelgan de él/);
  });

  it('un centro inválido NO se guarda como nulo: se niega', async () => {
    /*
     * Éste es el que importa. Tragarse el dato malo y guardar null dejaría una
     * partida mal clasificada que nadie va a volver a mirar, y el reporte por
     * centro diría una cifra equivocada con total aplomo.
     */
    await expect(
      centroDeLaPartida(em({ centros: [], cuantosActivos: 1 }), EMPRESA, {
        centroCostoId: 'cc-inventado',
        tipoCuenta: TipoCuenta.ACTIVO,
        llevaCentros: false,
      }),
    ).rejects.toThrow(/no existe/);
  });
});
