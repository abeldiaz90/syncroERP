import { ConflictException } from '@nestjs/common';
import { EstadoEjecucion } from '../../integracion/validacion/validacion.constants';
import { AprobacionesDocumentosService } from './aprobaciones-documentos.service';

/**
 * La puerta de validacion previa a otorgar una linea de credito.
 *
 * Es el punto donde se decide a quien se le presta, asi que las pruebas fijan
 * sobre todo cuando NO debe abrirse. Un falso «adelante» aqui termina en un
 * credito otorgado a quien el flujo habia rechazado.
 */
describe('Puerta de validacion al autorizar la linea', () => {
  function servicio(flujo: unknown, historial: unknown[]) {
    const validacion = {
      flujoActivo: jest.fn(async () => flujo),
      historial: jest.fn(async () => historial),
    };
    const svc = new AprobacionesDocumentosService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      { lineaAutorizada: jest.fn() } as any,
      validacion as any,
    );
    const exigir = (limite = 10_000) =>
      (svc as any).exigirValidacionFavorable('emp', 'cli', limite);
    return { exigir, validacion };
  }

  const FLUJO = { nombre: 'Originacion' };
  const expediente = (extra: Record<string, unknown> = {}) => ({
    estado: EstadoEjecucion.APROBADA,
    limiteSolicitado: '10000.00',
    simulacion: false,
    motivos: [],
    ...extra,
  });

  /*
   * Una empresa que no configuro flujo sigue operando como siempre. Activar la
   * puerta para todos romperia a quien nunca pidio verificar nada.
   */
  it('no exige nada si la empresa no tiene flujo activo', async () => {
    const s = servicio(null, []);

    await expect(s.exigir()).resolves.toBeUndefined();
    expect(s.validacion.historial).not.toHaveBeenCalled();
  });

  it('deja autorizar con expediente aprobado que cubre el importe', async () => {
    const s = servicio(FLUJO, [expediente()]);

    await expect(s.exigir(10_000)).resolves.toBeUndefined();
  });

  it('bloquea cuando hay flujo activo y el cliente no tiene expediente', async () => {
    const s = servicio(FLUJO, []);

    await expect(s.exigir()).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloquea si el expediente quedo RECHAZADA', async () => {
    const s = servicio(FLUJO, [
      expediente({ estado: EstadoEjecucion.RECHAZADA, motivos: ['Identidad no verificada'] }),
    ]);

    await expect(s.exigir()).rejects.toThrow(/RECHAZADA/);
  });

  /*
   * REVISION_MANUAL significa «que lo mire una persona», y quien aprueba aqui
   * ES una persona. Bloquearlo convertiria el veredicto mas comun del motor
   * —el que sale cuando aun no hay proveedores— en un candado imposible.
   */
  it.each([EstadoEjecucion.REVISION_MANUAL, EstadoEjecucion.APROBADA_CON_AJUSTE])(
    'deja decidir a la persona cuando el veredicto es %s',
    async estado => {
      const s = servicio(FLUJO, [expediente({ estado })]);

      await expect(s.exigir()).resolves.toBeUndefined();
    },
  );

  /*
   * Sin esto bastaria con validar barato una vez para autorizar cualquier
   * importe despues.
   */
  it('bloquea si el expediente se hizo por un importe menor al que se autoriza', async () => {
    const s = servicio(FLUJO, [expediente({ limiteSolicitado: '5000.00' })]);

    await expect(s.exigir(500_000)).rejects.toThrow(/5000\.00/);
  });

  it('acepta un expediente hecho por un importe mayor', async () => {
    const s = servicio(FLUJO, [expediente({ limiteSolicitado: '50000.00' })]);

    await expect(s.exigir(10_000)).resolves.toBeUndefined();
  });

  /*
   * Los expedientes de simulacion existen para que el administrador pruebe su
   * flujo. Si valieran como respaldo, cualquiera autorizaria una linea forzando
   * las respuestas a APROBADO.
   */
  it('ignora los expedientes de simulacion', async () => {
    const s = servicio(FLUJO, [expediente({ simulacion: true })]);

    await expect(s.exigir()).rejects.toThrow(/no tiene expediente/);
  });
});
