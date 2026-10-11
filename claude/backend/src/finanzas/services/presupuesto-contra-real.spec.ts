/**
 * ============================================================================
 * Presupuesto contra real
 * ----------------------------------------------------------------------------
 * Un reporte por centro, solo, describe: dice que la sucursal norte gastó
 * 412,000 y no dice si eso está bien. Este comparativo es la segunda cifra.
 *
 * Lo que de verdad hay que vigilar aquí es el SIGNO, porque es donde esto se
 * rompe en silencio: el ingreso es acreedor y el gasto es deudor, así que
 * medir los dos con la misma resta daría el ingreso en negativo y el
 * comparativo diría que la empresa no vendió nada. Es el defecto que ya costó
 * una corrección en la balanza el 26-sep.
 *
 * Y el otro: «ejercer de más» es malo en un gasto y bueno en un ingreso. Es la
 * misma resta leída al revés, y si la pantalla tuviera que deducirlo, cada
 * pantalla lo deduciría a su manera.
 * ============================================================================
 */
import { ConflictException } from '@nestjs/common';

import { TipoCuenta } from '../entities/cuenta-contable.entity';
import { EstadoPresupuesto } from '../entities/presupuesto.entity';
import { PresupuestosService } from './presupuestos.service';

const EMPRESA = 'empresa-1';

const CUENTAS = [
  { id: 'cta-ing', empresaId: EMPRESA, numeroCuenta: '401.01', nombre: 'Ventas', tipo: TipoCuenta.INGRESO, esAfectable: true },
  { id: 'cta-gas', empresaId: EMPRESA, numeroCuenta: '601.01', nombre: 'Papelería', tipo: TipoCuenta.GASTO, esAfectable: true },
  { id: 'cta-act', empresaId: EMPRESA, numeroCuenta: '102.01', nombre: 'Bancos', tipo: TipoCuenta.ACTIVO, esAfectable: true },
];
const CENTROS = [
  { id: 'cc-1', empresaId: EMPRESA, nombre: 'Norte', aceptaMovimientos: true, activo: true },
];

function armar(opciones: {
  presupuesto?: any;
  lineas?: any[];
  real?: any[];
}) {
  const presupuesto = opciones.presupuesto ?? {
    id: 'pre-1',
    empresaId: EMPRESA,
    ejercicio: 2026,
    nombre: 'Original 2026',
    estado: EstadoPresupuesto.APROBADO,
  };
  const repo: any = {
    find: async () => [presupuesto],
    findOne: async () => presupuesto,
    save: async (x: any) => x,
    remove: async (x: any) => x,
    create: (x: any) => x,
  };
  const lineasRepo: any = {
    find: async () => opciones.lineas ?? [],
    count: async () => (opciones.lineas ?? []).length,
  };
  const dataSource: any = {
    query: async (sql: string) => {
      if (/FROM presupuesto_lineas/.test(sql)) return opciones.lineas ?? [];
      if (/FROM partidas_poliza/.test(sql)) return opciones.real ?? [];
      return [];
    },
    getRepository: (entidad: any) => ({
      find: async () =>
        entidad?.name === 'CentroCosto' ? CENTROS : CUENTAS,
    }),
    transaction: async (fn: any) => fn({ delete: async () => undefined, save: async (_e: any, x: any) => x, create: (_e: any, x: any) => x }),
  };
  return {
    servicio: new PresupuestosService(repo, lineasRepo, dataSource),
    presupuesto,
  };
}

describe('El signo de cada tipo de cuenta', () => {
  it('un INGRESO real sale de abonos menos cargos', async () => {
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-ing', centroCostoId: null, presupuesto: 100000 }],
      real: [{ cuentaContableId: 'cta-ing', centroCostoId: null, cargos: 2000, abonos: 95000 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    const fila = r.renglones.find((x: any) => x.cuentaContableId === 'cta-ing');
    /* 95,000 − 2,000 = 93,000. Con la resta al revés saldría −93,000. */
    expect(fila.real).toBe(93000);
    expect(fila.presupuesto).toBe(100000);
    expect(fila.diferencia).toBe(-7000);
  });

  it('un GASTO real sale de cargos menos abonos', async () => {
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-gas', centroCostoId: null, presupuesto: 10000 }],
      real: [{ cuentaContableId: 'cta-gas', centroCostoId: null, cargos: 12500, abonos: 500 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    const fila = r.renglones.find((x: any) => x.cuentaContableId === 'cta-gas');
    expect(fila.real).toBe(12000);
    expect(fila.diferencia).toBe(2000);
  });
});

describe('Qué es favorable y qué no', () => {
  it('ingresar MENOS de lo previsto no es favorable', async () => {
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-ing', centroCostoId: null, presupuesto: 100000 }],
      real: [{ cuentaContableId: 'cta-ing', centroCostoId: null, cargos: 0, abonos: 80000 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones[0].favorable).toBe(false);
  });

  it('ingresar MÁS sí lo es', async () => {
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-ing', centroCostoId: null, presupuesto: 100000 }],
      real: [{ cuentaContableId: 'cta-ing', centroCostoId: null, cargos: 0, abonos: 120000 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones[0].favorable).toBe(true);
  });

  it('gastar MÁS no lo es, aunque la diferencia tenga el mismo signo que el ingreso favorable', async () => {
    /*
     * Ésta es la que importa: +20,000 de diferencia es bueno en ventas y malo
     * en papelería. Misma resta, lectura contraria, y por eso la decide el
     * tipo de cuenta y no el signo.
     */
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-gas', centroCostoId: null, presupuesto: 10000 }],
      real: [{ cuentaContableId: 'cta-gas', centroCostoId: null, cargos: 30000, abonos: 0 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones[0].diferencia).toBe(20000);
    expect(r.renglones[0].favorable).toBe(false);
  });

  it('gastar menos sí lo es', async () => {
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-gas', centroCostoId: null, presupuesto: 10000 }],
      real: [{ cuentaContableId: 'cta-gas', centroCostoId: null, cargos: 7000, abonos: 0 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones[0].favorable).toBe(true);
  });
});

describe('Lo que el comparativo no debe hacer', () => {
  it('una cuenta de BALANCE que se coló en el real no entra', async () => {
    /*
     * Sin este filtro, el saldo de Bancos aparecería como desviación total
     * —no tiene presupuesto contra el que medirse— y sería el renglón más
     * alarmante del reporte sin significar nada.
     */
    const { servicio } = armar({
      lineas: [],
      real: [{ cuentaContableId: 'cta-act', centroCostoId: null, cargos: 500000, abonos: 0 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones).toEqual([]);
  });

  it('sin presupuesto no inventa un porcentaje', async () => {
    /* Dividir entre cero da Infinity y la pantalla pinta «∞ %». */
    const { servicio } = armar({
      lineas: [],
      real: [{ cuentaContableId: 'cta-gas', centroCostoId: null, cargos: 4000, abonos: 0 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones[0].porcentajeEjercido).toBeNull();
  });

  it('y cuenta aparte lo que se gastó sin presupuestar: es un plan incompleto, no una desviación', async () => {
    const { servicio } = armar({
      lineas: [],
      real: [{ cuentaContableId: 'cta-gas', centroCostoId: null, cargos: 4000, abonos: 0 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.sinPresupuesto).toBe(1);
  });

  it('el porcentaje ejercido se calcula cuando sí hay presupuesto', async () => {
    const { servicio } = armar({
      lineas: [{ cuentaContableId: 'cta-gas', centroCostoId: null, presupuesto: 10000 }],
      real: [{ cuentaContableId: 'cta-gas', centroCostoId: null, cargos: 7500, abonos: 0 }],
    });
    const r: any = await servicio.comparativo('pre-1', EMPRESA);
    expect(r.renglones[0].porcentajeEjercido).toBe(75);
  });
});

describe('El estado es el control', () => {
  it('un presupuesto APROBADO ya no se edita', async () => {
    /*
     * Si se pudiera, siempre se ajustaría al real y no habría desviación
     * nunca. Es el mismo razonamiento del cierre contable: lo que ya se firmó
     * no se reescribe, y la salida es crear una revisión.
     */
    const { servicio } = armar({ lineas: [] });
    await expect(
      servicio.capturar('pre-1', EMPRESA, [
        { cuentaContableId: 'cta-gas', mes: 1, importe: 100 },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('y la negativa dice qué hacer en su lugar', async () => {
    const { servicio } = armar({ lineas: [] });
    await expect(
      servicio.capturar('pre-1', EMPRESA, [
        { cuentaContableId: 'cta-gas', mes: 1, importe: 100 },
      ]),
    ).rejects.toThrow(/crea una revisión/);
  });

  it('no se aprueba uno vacío', async () => {
    const borrador = {
      id: 'pre-2', empresaId: EMPRESA, ejercicio: 2026,
      nombre: 'Vacío', estado: EstadoPresupuesto.BORRADOR,
    };
    const { servicio } = armar({ presupuesto: borrador, lineas: [] });
    await expect(servicio.aprobar('pre-2', EMPRESA)).rejects.toThrow(
      /todo el gasto del ejercicio es desviación/,
    );
  });

  it('en BORRADOR sí se captura, y se valida cada línea', async () => {
    const borrador = {
      id: 'pre-2', empresaId: EMPRESA, ejercicio: 2026,
      nombre: 'Borrador', estado: EstadoPresupuesto.BORRADOR,
    };
    const { servicio } = armar({ presupuesto: borrador, lineas: [] });
    const r: any = await servicio.capturar('pre-2', EMPRESA, [
      { cuentaContableId: 'cta-gas', centroCostoId: 'cc-1', mes: 3, importe: 1500 },
    ]);
    expect(r.lineas).toBe(1);
  });

  it('una cuenta de BALANCE no se presupuesta aquí', async () => {
    const borrador = {
      id: 'pre-2', empresaId: EMPRESA, ejercicio: 2026,
      nombre: 'Borrador', estado: EstadoPresupuesto.BORRADOR,
    };
    const { servicio } = armar({ presupuesto: borrador, lineas: [] });
    await expect(
      servicio.capturar('pre-2', EMPRESA, [
        { cuentaContableId: 'cta-act', mes: 1, importe: 100 },
      ]),
    ).rejects.toThrow(/no se ejerce/);
  });

  it('un mes fuera de rango se niega', async () => {
    const borrador = {
      id: 'pre-2', empresaId: EMPRESA, ejercicio: 2026,
      nombre: 'Borrador', estado: EstadoPresupuesto.BORRADOR,
    };
    const { servicio } = armar({ presupuesto: borrador, lineas: [] });
    await expect(
      servicio.capturar('pre-2', EMPRESA, [
        { cuentaContableId: 'cta-gas', mes: 13, importe: 100 },
      ]),
    ).rejects.toThrow(/de 1 a 12/);
  });
});
