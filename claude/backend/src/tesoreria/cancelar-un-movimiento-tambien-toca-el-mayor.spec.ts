import { Logger } from '@nestjs/common';
import { MotorContableService } from '../finanzas/services/motor-contable.service';
import { Poliza, TipoPoliza } from '../finanzas/entities/poliza.entity';
import { PartidaPoliza } from '../finanzas/entities/partida-poliza.entity';
import { TipoAsiento } from '../finanzas/entities/asiento-pendiente.entity';
import { TesoreriaService } from './services/tesoreria.service';

/**
 * ============================================================================
 * CANCELAR UN MOVIMIENTO DE TESORERÍA TAMBIÉN TIENE QUE TOCAR EL MAYOR
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Registrar un movimiento manual de tesorería hace dos cosas: anota el
 * movimiento en el auxiliar (`movimientos_tesoreria`, con su saldo posterior) y
 * encola su póliza.
 *
 * Cancelarlo hacía **sólo la primera**: marcaba el original como cancelado,
 * creaba la contrapartida en el auxiliar y recalculaba los saldos de la cuenta
 * bancaria. En la contabilidad no pasaba nada: la póliza del movimiento seguía
 * ahí y nadie generaba la contraria.
 *
 *     Auxiliar de bancos ..... neto cero ✓
 *     Mayor .................. el importe completo, sin reversar ✗
 *
 * Divergen de forma permanente y por el importe entero. No hay error, no hay
 * cola de asientos fallidos, no hay pantalla que lo enseñe: la diferencia sólo
 * aparece el día que alguien concilia el banco contra la balanza, y para
 * entonces hay que ir movimiento por movimiento a buscar cuál fue.
 *
 * EL ARREGLO
 *
 * La cancelación encola `CANCELACION_TESORERIA`, que **espeja la póliza del
 * movimiento original** —lee `TESORERIA:<id>` e invierte cargo y abono—. Es la
 * misma pieza que resolvió la anulación de ventas el mismo día, y por la misma
 * razón: contrarrestar un asiento es devolver cada peso a la cuenta de la que
 * salió, no volver a decidir cuentas.
 *
 * DOS DECISIONES QUE SE COMPRUEBAN AQUÍ
 *
 *  · **Sólo se encola si el original se contabilizó.** Los movimientos que
 *    llegan de ventas, cobranza o compras ya generan su póliza en su módulo;
 *    encolar una reversión para ellos crearía la contraria de una póliza que
 *    aquí no existe — el defecto simétrico.
 *
 *  · **Sin póliza original, se falla.** Puede faltar porque el asiento original
 *    siga en la cola; fallar deja el trabajo en la bandeja de pendientes, que lo
 *    reintenta. Devolver «hecho» dejaría el mayor como estaba, que es justo lo
 *    que esto corrige.
 * ============================================================================
 */

const BANCO = 'cta-banco';
const GASTO = 'cta-gasto';

/** Un egreso manual de 500: cargo al gasto, abono al banco. */
const PARTIDAS_DEL_MOVIMIENTO = [
  { cuentaContableId: GASTO, cargo: 500, abono: 0 },
  { cuentaContableId: BANCO, cargo: 0, abono: 500 },
];

type PolizaGuardada = { poliza: any; partidas: any[] };

function crearArnes(opts?: { conPolizaOriginal?: boolean }) {
  const guardadas: PolizaGuardada[] = [];
  let pendiente: any = null;

  const manager = {
    create: (_e: any, obj: any) => obj,
    findOne: jest.fn(async () => null),
    save: jest.fn(async (entOrObj: any, maybeArr?: any) => {
      if (Array.isArray(maybeArr)) {
        guardadas.push({ poliza: pendiente, partidas: maybeArr });
        return maybeArr;
      }
      pendiente = { ...entOrObj, id: `pol-${guardadas.length + 1}` };
      return pendiente;
    }),
  };

  const dataSource: any = {
    query: jest.fn(async () => []),
    getRepository: jest.fn((entidad: any) => {
      if (entidad === Poliza) {
        return {
          findOne: async ({ where }: any) =>
            opts?.conPolizaOriginal &&
            where.origenClave === 'TESORERIA:mov-1'
              ? { id: 'orig-1' }
              : null,
        };
      }
      if (entidad === PartidaPoliza) {
        return { find: async () => PARTIDAS_DEL_MOVIMIENTO };
      }
      return { findOne: async () => null, createQueryBuilder: () => ({}) };
    }),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) =>
        sql.includes('pg_advisory_xact_lock') ? [{ resultado: 0 }] : [],
      ),
      manager,
    }),
  };

  return {
    servicio: new MotorContableService(dataSource, {} as any),
    guardadas,
  };
}

const cancelacion = {
  movimientoId: 'mov-1',
  empresaId: 'emp-1',
  fecha: new Date('2026-09-30'),
  folio: 'TES-77',
  motivo: 'Se capturó dos veces.',
};

const importeEn = (partidas: any[], cuenta: string, lado: 'cargo' | 'abono') =>
  partidas
    .filter((p) => p.cuentaContableId === cuenta)
    .reduce((s, p) => s + Number(p[lado] ?? 0), 0);

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('la póliza que deshace un movimiento de tesorería', () => {
  it('devuelve el dinero al banco y quita el gasto', async () => {
    const { servicio, guardadas } = crearArnes({ conPolizaOriginal: true });
    await servicio.generarAsientoDeCancelacionTesoreria(cancelacion);

    expect(guardadas).toHaveLength(1);
    expect(importeEn(guardadas[0].partidas, BANCO, 'cargo')).toBe(500);
    expect(importeEn(guardadas[0].partidas, GASTO, 'abono')).toBe(500);
  });

  it('no elige cuentas: usa exactamente las del movimiento original', async () => {
    /*
     * La propiedad que impide que esto se separe. Un movimiento manual se
     * captura contra la contrapartida que elija quien lo registra; recalcular
     * obligaría a repetir esa decisión aquí, y bastaría un caso nuevo para que
     * las dos lógicas dejaran de coincidir sin que nada fallara.
     */
    const { servicio, guardadas } = crearArnes({ conPolizaOriginal: true });
    await servicio.generarAsientoDeCancelacionTesoreria(cancelacion);

    expect(
      [...new Set(guardadas[0].partidas.map((p) => p.cuentaContableId))].sort(),
    ).toEqual([BANCO, GASTO].sort());
  });

  it('queda enlazada al movimiento, para poder seguirla', async () => {
    const { servicio, guardadas } = crearArnes({ conPolizaOriginal: true });
    await servicio.generarAsientoDeCancelacionTesoreria(cancelacion);

    expect(guardadas[0].poliza.origenClave).toBe('CANCELACION_TESORERIA:mov-1');
    expect(guardadas[0].poliza.tipo).toBe(TipoPoliza.DIARIO);
  });

  it('falla si la póliza original todavía no existe, en vez de dar por hecho', async () => {
    /*
     * Fallar deja el trabajo en la bandeja de asientos pendientes, que lo
     * reintenta cuando el asiento original se genere. Devolver «hecho» dejaría
     * el mayor sin reversar, que es el defecto que esto corrige.
     */
    const { servicio, guardadas } = crearArnes({ conPolizaOriginal: false });

    await expect(
      servicio.generarAsientoDeCancelacionTesoreria(cancelacion),
    ).rejects.toThrow(/todavía no existe la póliza del movimiento original/i);
    expect(guardadas).toHaveLength(0);
  });
});

describe('la cancelación encola el asiento, que es lo que faltaba', () => {
  /*
   * El método de arriba puede estar perfecto y no servir de nada si nadie lo
   * encola: eso es exactamente lo que pasaba —el motor nunca tuvo este asiento y
   * la cancelación nunca lo pidió—. Se monta el servicio con el mismo armado que
   * ya usa `un-movimiento-que-no-es-suyo.spec.ts`, para no tener dos armados del
   * mismo método que acaben divergiendo.
   */
  function servicioCon(origen: string) {
    const encolados: Array<{ tipo: unknown; datos: any }> = [];
    const s = Object.create(TesoreriaService.prototype) as Record<string, unknown>;
    s.movimientos = {
      findOne: () =>
        Promise.resolve({
          id: 'mov-1',
          empresaId: 'e1',
          folio: 'TES-77',
          cuentaBancariaId: 'c1',
          fecha: new Date('2026-09-20'),
          tipo: 'EGRESO',
          origen,
          importe: 500,
          cancelado: false,
          tipoDocumento: null,
        }),
    };
    s.dataSource = {
      transaction: (cuerpo: (m: unknown) => Promise<unknown>) =>
        cuerpo({
          getRepository: () => ({
            save: (x: Record<string, unknown>) => Promise.resolve(x),
            create: (x: Record<string, unknown>) => x,
          }),
        }),
    };
    s.asientos = {
      encolarEnTransaccion: (
        _m: unknown,
        tipo: unknown,
        datos: unknown,
      ) => {
        encolados.push({ tipo, datos });
        return Promise.resolve({ id: 'pend-1' });
      },
    };
    s.siguienteFolio = () => Promise.resolve('MOV-999');
    s.recalcularSaldos = () => Promise.resolve(undefined);
    return { s: s as unknown as TesoreriaService, encolados };
  }

  it('encola CANCELACION_TESORERIA al cancelar un movimiento manual', async () => {
    const { s, encolados } = servicioCon('MANUAL');
    await s.cancelar('mov-1', 'Se capturó dos veces.', 'e1', 'u1');

    expect(encolados).toHaveLength(1);
    expect(encolados[0].tipo).toBe(TipoAsiento.CANCELACION_TESORERIA);
    expect(encolados[0].datos.movimientoId).toBe('mov-1');
    expect(encolados[0].datos.motivo).toBe('Se capturó dos veces.');
  });

  it('no encola nada para un movimiento que contabiliza su propio módulo', async () => {
    /*
     * Los que llegan de ventas, cobranza o compras ya generan su póliza allí.
     * Encolar una reversión para ellos crearía la contraria de una póliza que
     * aquí no existe: el defecto simétrico al que se está corrigiendo.
     */
    const { s, encolados } = servicioCon('COBRANZA');
    await s.cancelar('mov-1', 'Prueba.', 'e1', 'u1');

    expect(encolados).toHaveLength(0);
  });

  it('el despachador sabe a qué método llamar', () => {
    /* Estructural a propósito: el mapa es una tabla, no una decisión. */
    const despachador = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '..',
        'finanzas',
        'services',
        'asientos-pendientes.service.ts',
      ),
      'utf8',
    ) as string;
    expect(despachador).toContain("'generarAsientoDeCancelacionTesoreria'");
    expect(TipoAsiento.CANCELACION_TESORERIA).toBe('CANCELACION_TESORERIA');
  });
});
