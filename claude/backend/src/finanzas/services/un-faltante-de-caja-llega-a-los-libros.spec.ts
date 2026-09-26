/**
 * ============================================================================
 * Un faltante de caja que no llega a ningún libro
 * ----------------------------------------------------------------------------
 * Cerrar un turno calculaba la diferencia entre lo esperado y lo contado,
 * exigía explicarla por escrito —eso ya estaba bien— y la guardaba en la fila
 * del turno. Y ahí se quedaba: **ningún asiento**.
 *
 * Medido el 25-sep-2026 con el primer turno de caja del sistema: fondo 500,
 * ventas 240, esperado 740, contado 730. El turno guardó `diferencia: -10` y no
 * se generó ninguna póliza. El mayor sigue diciendo que en Caja hay 740 y el
 * cajón tiene 730, para siempre, y desde la contabilidad no hay manera de
 * explicar la diferencia: al cierre del mes aparece un descuadre sin origen.
 *
 * Un faltante es un gasto y un sobrante es un ingreso; los dos van contra la
 * cuenta de la caja, que es la que tiene que quedar igual a lo que hay dentro.
 *
 * De paso salió que `OTROS_GASTOS` y `OTROS_INGRESOS` existían en el enum de
 * roles y NINGUNA cuenta del plan estándar los tenía asignados: los asientos
 * que dependen de ellos —éste y la baja de activo fijo— no se podían generar.
 * ============================================================================
 */
import { Logger } from '@nestjs/common';
import { MotorContableService } from './motor-contable.service';

describe('el arqueo con diferencia se registra en el mayor', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  function crear(opts: { sinContrapartida?: boolean; sinCuentaCaja?: boolean } = {}) {
    const guardadas: any[] = [];
    const manager: any = {
      save: jest.fn(async (entidad: any, valor: any) => {
        const dato = valor ?? entidad;
        guardadas.push(dato);
        return Array.isArray(dato)
          ? dato.map((d: any, i: number) => ({ ...d, id: `x${i}` }))
          : { ...dato, id: 'poliza-1' };
      }),
      create: jest.fn((_: any, valor: any) => valor),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
    };
    const dataSource: any = {
      query: jest.fn(async (sql: string) =>
        /cuentas_bancarias/i.test(sql)
          ? opts.sinCuentaCaja
            ? [{ cuentaContableId: null }]
            : [{ cuentaContableId: 'cta-caja' }]
          : [],
      ),
      getRepository: jest.fn(() => ({
        createQueryBuilder: () => {
          const qb: any = {
            where: () => qb,
            andWhere: () => qb,
            orderBy: () => qb,
            getOne: async () =>
              opts.sinContrapartida
                ? null
                : { id: 'cta-otros', numeroCuenta: '703.21' },
          };
          return qb;
        },
        findOne: async () => ({ id: 'cta-caja', numeroCuenta: '101.01' }),
      })),
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
    const productoRepo: any = {
      createQueryBuilder: () => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: async () => [],
      }),
    };
    return {
      servicio: new MotorContableService(dataSource, productoRepo),
      guardadas,
    };
  }

  const base = {
    empresaId: 'e1',
    turnoId: 'e05e6e8e-91b0-4807-bffe-23f6efe05ee5',
    cuentaCajaId: 'caja-1',
    fecha: new Date('2026-09-25'),
    observaciones: 'Faltan 10',
  };

  const partidasDe = (guardadas: any[]) =>
    guardadas.flatMap((g) => (Array.isArray(g) ? g : [])).filter((p) => p?.cargo !== undefined);

  it('un faltante carga el gasto y abona la caja', async () => {
    const { servicio, guardadas } = crear();
    const id = await servicio.generarAsientoDeCierreCaja({
      ...base,
      diferencia: -10,
    });

    expect(id).toBe('poliza-1');
    const partidas = partidasDe(guardadas);
    expect(partidas).toEqual([
      expect.objectContaining({ cuentaContableId: 'cta-otros', cargo: 10, abono: 0 }),
      expect.objectContaining({ cuentaContableId: 'cta-caja', cargo: 0, abono: 10 }),
    ]);
  });

  it('un sobrante carga la caja y abona el ingreso', async () => {
    const { servicio, guardadas } = crear();
    await servicio.generarAsientoDeCierreCaja({ ...base, diferencia: 25.5 });

    const partidas = partidasDe(guardadas);
    expect(partidas).toEqual([
      expect.objectContaining({ cuentaContableId: 'cta-caja', cargo: 25.5, abono: 0 }),
      expect.objectContaining({ cuentaContableId: 'cta-otros', cargo: 0, abono: 25.5 }),
    ]);
  });

  it('un arqueo que cuadra no genera nada, y eso está bien', async () => {
    const { servicio, guardadas } = crear();
    const id = await servicio.generarAsientoDeCierreCaja({ ...base, diferencia: 0 });
    expect(id).toBeUndefined();
    expect(guardadas).toEqual([]);
  });

  it('sin cuenta donde registrarlo, falla y lo dice; no se inventa una', async () => {
    const { servicio, guardadas } = crear({ sinContrapartida: true });
    await expect(
      servicio.generarAsientoDeCierreCaja({ ...base, diferencia: -10 }),
    ).rejects.toThrow(/otros gastos/i);
    expect(guardadas).toEqual([]);
  });

  it('si la caja no tiene cuenta contable propia, cae en la cuenta general de caja', async () => {
    /*
     * Es el comportamiento que ya tiene TODA operación en efectivo del sistema:
     * `buscarCuentaSegunMetodoPago` recurre a la cuenta con rol CAJA cuando la
     * caja concreta no tiene la suya. Se deja igual aquí a propósito —cambiarlo
     * sólo en el arqueo dejaría el faltante fuera de los libros justo en la
     * instalación peor configurada, que es la que más lo necesita—.
     *
     * Lo que avisa de esa configuración incompleta es el diagnóstico
     * `FIN_BANCOS`, que bloquea mientras haya cajas sin cuenta contable.
     */
    const { servicio, guardadas } = crear({ sinCuentaCaja: true });
    const id = await servicio.generarAsientoDeCierreCaja({
      ...base,
      diferencia: -10,
    });
    expect(id).toBe('poliza-1');
    expect(partidasDe(guardadas)).toHaveLength(2);
  });
});
