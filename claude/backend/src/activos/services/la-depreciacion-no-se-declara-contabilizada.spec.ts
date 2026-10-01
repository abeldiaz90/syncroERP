/**
 * ============================================================================
 * Una póliza que no se generó no vuelve «GENERADO»
 * ----------------------------------------------------------------------------
 * `AsientosPendientesService.reintentarAhora` NO lanza cuando el asiento falla:
 * atrapa el error, deja el registro en FALLIDO y devuelve
 * `{ generado: false, mensaje }`. Es su contrato y es el correcto — la
 * operación de negocio ya está confirmada y no debe caerse porque la
 * contabilidad esté mal configurada.
 *
 * Nueve de los diez lugares que lo llaman leen `resultado.generado`. La corrida
 * de depreciación no: lo envolvía en un `try/catch` y ponía
 * `estadoContable = 'GENERADO'` con sólo no haber lanzado. Como nunca lanza,
 * **siempre decía GENERADO** — incluso con el asiento FALLIDO en la bandeja por
 * una cuenta de depreciación sin configurar.
 *
 * El `catch` no estaba de más: `reintentarAhora` sí lanza `NotFoundException`
 * si el registro no existe. Lo que faltaba era mirar lo que devuelve.
 * ============================================================================
 */
import { Logger } from '@nestjs/common';
import { ActivosService } from './activos.service';

describe('correrDepreciación · el estado contable dice la verdad', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  function crear(respuestaDelReintento: any) {
    const activo: any = {
      id: 'af-1',
      empresaId: 'e1',
      codigo: 'AF-000001',
      nombre: 'Montacargas',
      estado: 'ACTIVO',
      costoAdquisicion: 120000,
      valorResidual: 0,
      vidaUtilMeses: 120,
      depreciacionAcumulada: 0,
      mesesDepreciados: 0,
      inicioDepreciacion: new Date(2026, 0, 1),
      categoria: {
        cuentaGastoDepreciacionId: 'cta-gasto',
        cuentaDepreciacionAcumuladaId: 'cta-acum',
      },
    };

    const repoActivos: any = {
      find: jest.fn(async () => [activo]),
      save: jest.fn(async (v: any) => v),
    };
    const repoDep: any = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ ...v, id: 'dep-1' })),
    };
    const manager: any = {
      getRepository: (entidad: any) =>
        String(entidad?.name ?? '').includes('Depreciacion')
          ? repoDep
          : repoActivos,
    };
    const dataSource: any = {
      transaction: jest.fn(async (_nivel: any, fn: any) => fn(manager)),
      /*
       * La corrida pregunta a `cierres_contables` antes de empezar: un periodo
       * cerrado se rechaza ANTES de tocar los activos, no después, cuando la
       * póliza ya no se puede crear y el registro de activos y el mayor han
       * dejado de decir lo mismo. Aquí el periodo está abierto.
       */
      query: jest.fn(async () => []),
    };
    const asientos: any = {
      encolarEnTransaccion: jest.fn(async () => ({ id: 'pend-1' })),
      reintentarAhora: jest.fn(async () => respuestaDelReintento),
    };
    const servicio = new ActivosService(
      repoActivos,
      {} as any,
      repoDep,
      dataSource,
      asientos,
      /* FoliosService: esta prueba no da de alta activos. */
      {} as any,
    );
    return { servicio, asientos, activo, repoActivos, dataSource };
  }

  it('un periodo CERRADO se rechaza antes de tocar los activos', async () => {
    /*
     * Medido el 26-sep-2026: la corrida de agosto sobre un mes ya cerrado
     * registró la depreciación —el activo sumó su mes, subió la acumulada,
     * bajó el valor en libros— y la póliza reventó al final con «El período
     * 8/2026 está cerrado». El registro de activos y el mayor dejaron de decir
     * lo mismo, y arreglarlo exige reabrir el mes y reintentar desde la
     * bandeja: una reparación que el contador no tiene por qué adivinar.
     *
     * Comprobar antes cuesta una consulta. No comprobar cuesta un descuadre.
     */
    const { servicio, dataSource, repoActivos, activo } = crear({
      generado: true,
      polizaId: 'POL-1',
    });
    dataSource.query = jest.fn(async () => [{ id: 'cierre-8' }]);

    await expect(servicio.correrDepreciacion(2026, 1, 'e1')).rejects.toThrow(
      /cerrado/i,
    );
    expect(repoActivos.save).not.toHaveBeenCalled();
    expect(activo.mesesDepreciados).toBe(0);
  });

  it('si no se puede preguntar por el cierre, la corrida no se ejecuta', async () => {
    // Un candado que no pudo preguntar no dice «abierto».
    const { servicio, dataSource, repoActivos } = crear({
      generado: true,
      polizaId: 'POL-1',
    });
    dataSource.query = jest.fn(async () => {
      throw new Error('conexión perdida');
    });

    await expect(servicio.correrDepreciacion(2026, 1, 'e1')).rejects.toThrow(
      /no se pudo comprobar/i,
    );
    expect(repoActivos.save).not.toHaveBeenCalled();
  });

  it('dos corridas del mismo mes no comparten la clave de la póliza', async () => {
    /*
     * Medido el 26-sep-2026: se corrió julio con la camioneta ($10,000), se
     * dio de alta el servidor AF-000002 y se volvió a correr julio ($2,400).
     * La segunda corrida procesó sólo al recién llegado y, al contabilizarlo,
     * `crearPoliza` se topó con la clave de la primera —era sólo
     * `empresa:ejercicio:mes`—, devolvió la póliza vieja y no asentó nada. El
     * activo quedó depreciado en su auxiliar y el mayor siguió diciendo
     * $10,000. La respuesta decía «GENERADO», porque una póliza sí había.
     *
     * La clave lleva ahora los activos que cada corrida depreció.
     */
    const primera = crear({ generado: true, polizaId: 'POL-1' });
    await primera.servicio.correrDepreciacion(2026, 1, 'e1');
    const claveA = primera.asientos.encolarEnTransaccion.mock.calls[0][2].corridaId;

    const segunda = crear({ generado: true, polizaId: 'POL-2' });
    segunda.activo.id = 'af-2';
    segunda.activo.codigo = 'AF-000002';
    await segunda.servicio.correrDepreciacion(2026, 1, 'e1');
    const claveB = segunda.asientos.encolarEnTransaccion.mock.calls[0][2].corridaId;

    expect(claveA).toBeTruthy();
    expect(claveB).not.toBe(claveA);
  });

  it('la misma corrida repetida conserva su clave: sigue siendo idempotente', async () => {
    const a = crear({ generado: true, polizaId: 'POL-1' });
    await a.servicio.correrDepreciacion(2026, 1, 'e1');
    const b = crear({ generado: true, polizaId: 'POL-1' });
    await b.servicio.correrDepreciacion(2026, 1, 'e1');

    expect(b.asientos.encolarEnTransaccion.mock.calls[0][2].corridaId).toBe(
      a.asientos.encolarEnTransaccion.mock.calls[0][2].corridaId,
    );
  });

  it('cuando la póliza se generó, lo dice', async () => {
    const { servicio } = crear({ generado: true, polizaId: 'POL-1' });
    const r: any = await servicio.correrDepreciacion(2026, 1, 'e1');
    expect(r.estadoContable).toBe('GENERADO');
  });

  it('cuando la póliza NO se generó, no lo dice', async () => {
    const { servicio } = crear({
      generado: false,
      mensaje: 'Falta la cuenta de depreciación acumulada.',
    });
    const r: any = await servicio.correrDepreciacion(2026, 1, 'e1');
    expect(r.estadoContable).toBe('PENDIENTE');
  });
});
