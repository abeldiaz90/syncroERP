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
    );
    return { servicio, asientos };
  }

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
