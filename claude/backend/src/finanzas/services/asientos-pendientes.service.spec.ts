import { AsientosPendientesService } from './asientos-pendientes.service';
import {
  EstadoAsiento,
  TipoAsiento,
} from '../entities/asiento-pendiente.entity';

describe('AsientosPendientesService', () => {
  it('rehidrata fechas ISO antes de reintentar el motor contable', async () => {
    const generar = jest.fn().mockResolvedValue(undefined);
    const servicio = new AsientosPendientesService(
      {} as any,
      { generarAsientoDeVenta: generar } as any,
    );

    await (servicio as any).ejecutar(TipoAsiento.VENTA, {
      fecha: '2026-07-29T22:03:42.590Z',
    });

    expect(generar).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: expect.any(Date) }),
    );
  });

  it('despacha una devolución al método contable específico', async () => {
    const generar = jest.fn().mockResolvedValue(undefined);
    const servicio = new AsientosPendientesService(
      {} as any,
      { generarAsientoDeDevolucionVenta: generar } as any,
    );

    await (servicio as any).ejecutar(TipoAsiento.DEVOLUCION_VENTA, {
      fecha: '2026-07-30T03:00:00.000Z',
      devolucionId: 'dev-1',
    });

    expect(generar).toHaveBeenCalledWith(
      expect.objectContaining({
        devolucionId: 'dev-1',
        fecha: expect.any(Date),
      }),
    );
  });

  it('al resolverse limpia el error vigente y conserva el antecedente en la resolución', async () => {
    const asiento: any = {
      id: 'pend-1',
      empresaId: 'emp-1',
      tipo: TipoAsiento.VENTA,
      estado: EstadoAsiento.FALLIDO,
      payload: JSON.stringify({ fecha: '2026-07-29T22:03:42.590Z' }),
      intentos: 4,
      ultimoError: 'Faltaba Clientes por cobrar.',
      proximoIntento: null,
    };
    const repo: any = {
      findOne: jest.fn().mockResolvedValue(asiento),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (valor) => valor),
    };
    const generar = jest.fn().mockResolvedValue(undefined);
    const servicio = new AsientosPendientesService(repo, {
      generarAsientoDeVenta: generar,
    } as any);

    const resultado = await servicio.reintentarAhora('pend-1', 'emp-1');

    expect(resultado.generado).toBe(true);
    expect(asiento.estado).toBe(EstadoAsiento.GENERADO);
    expect(asiento.ultimoError).toBeNull();
    expect(asiento.proximoIntento).toBeNull();
    expect(asiento.notaResolucion).toContain('Faltaba Clientes por cobrar');
  });

  it('sólo un usuario puede reclamar el mismo reintento manual', async () => {
    const repo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pend-1',
        empresaId: 'emp-1',
        tipo: TipoAsiento.VENTA,
        estado: EstadoAsiento.FALLIDO,
        payload: '{}',
      }),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const generar = jest.fn();
    const servicio = new AsientosPendientesService(repo, {
      generarAsientoDeVenta: generar,
    } as any);

    const resultado = await servicio.reintentarAhora('pend-1', 'emp-1');

    expect(resultado.generado).toBe(false);
    expect(resultado.mensaje).toContain('otro usuario');
    expect(generar).not.toHaveBeenCalled();
  });
});
