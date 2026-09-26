import { Logger } from '@nestjs/common';
import { ActivosService } from './activos.service';

/**
 * ============================================================================
 * La baja que encolaba su póliza y nunca la intentaba
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 26-sep-2026 contra la instalación
 *
 * Se vendió la camioneta AF-000001: costo $480,000, depreciación acumulada
 * $20,000, valor en libros $460,000, vendida en $500,000. La pantalla calculó
 * bien —«Utilidad $40,000»—, la baja se registró, el activo salió del listado.
 *
 * Y el asiento quedó así en la bandeja de pendientes:
 *
 *   BAJA_ACTIVO · PENDIENTE · 0 intentos
 *
 * Cero intentos. No es que la póliza fallara: es que nunca se intentó. La
 * utilidad de $40,000 no se reconoció, el dinero no entró, y el balance siguió
 * enseñando la camioneta a costo histórico con su depreciación acumulada.
 * Nadie se entera hasta el cierre, y para entonces hay que reconstruir de
 * dónde salió el descuadre.
 *
 * Todos los demás circuitos del ERP —venta, compra, depreciación, hospedaje—
 * llaman a `reintentarAhora` en cuanto la operación queda confirmada y LEEN lo
 * que devuelve. La baja encolaba y devolvía el id, nada más.
 *
 * LA REGLA
 *
 * Una operación que genera contabilidad la intenta en el acto y dice cómo le
 * fue. Si la póliza no sale, la operación no se cae —ya está confirmada— pero
 * tampoco se calla: `estadoContable` viaja en la respuesta para que la
 * pantalla pueda avisar.
 * ============================================================================
 */

describe('Baja de activo · la póliza se intenta y el estado se dice', () => {
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
      nombre: 'Camioneta de reparto Nissan NP300',
      estado: 'ACTIVO',
      categoriaId: 'cat-tran',
      costoAdquisicion: 480000,
      depreciacionAcumulada: 20000,
      valorResidual: 0,
    };
    const categoria: any = {
      id: 'cat-tran',
      cuentaActivoId: 'cta-transporte',
      cuentaDepreciacionAcumuladaId: 'cta-dep-transporte',
    };
    const repoActivos: any = {
      findOne: jest.fn(async () => activo),
      save: jest.fn(async (v: any) => v),
    };
    const repoCategorias: any = { findOne: jest.fn(async () => categoria) };
    const manager: any = {
      getRepository: (entidad: any) =>
        String(entidad?.name ?? '').includes('Categoria')
          ? repoCategorias
          : repoActivos,
    };
    const dataSource: any = {
      transaction: jest.fn(async (fn: any) => fn(manager)),
      query: jest.fn(async () => []),
    };
    const asientos: any = {
      encolarEnTransaccion: jest.fn(async () => ({ id: 'pend-baja-1' })),
      reintentarAhora: jest.fn(async () => respuestaDelReintento),
    };
    const servicio = new ActivosService(
      repoActivos,
      repoCategorias,
      {} as any,
      dataSource,
      asientos,
    );
    return { servicio, asientos, activo };
  }

  const baja = {
    motivo: 'VENTA' as any,
    fecha: '2026-09-26',
    valorVenta: 500000,
    notas: 'Venta a Transportes del Norte, factura A-1042',
  };

  it('intenta la póliza en el acto, no la deja encolada', async () => {
    const { servicio, asientos } = crear({ generado: true, polizaId: 'POL-9' });
    await servicio.darDeBaja('af-1', baja, 'e1');

    expect(asientos.reintentarAhora).toHaveBeenCalledWith('pend-baja-1', 'e1');
  });

  it('cuando la póliza se generó, lo dice y trae el folio', async () => {
    const { servicio } = crear({ generado: true, polizaId: 'POL-9' });
    const r: any = await servicio.darDeBaja('af-1', baja, 'e1');

    expect(r.estadoContable).toBe('GENERADO');
    expect(r.polizaId).toBe('POL-9');
  });

  it('cuando la póliza NO se generó, no lo dice', async () => {
    const { servicio } = crear({
      generado: false,
      mensaje: 'Falta la cuenta de activo de la categoría.',
    });
    const r: any = await servicio.darDeBaja('af-1', baja, 'e1');

    expect(r.estadoContable).toBe('PENDIENTE');
    expect(r.mensajeContable).toMatch(/Falta la cuenta/);
  });

  it('la baja se confirma aunque la contabilidad falle', async () => {
    /*
     * La venta ya ocurrió: el activo salió y el dinero entró. Caerse aquí
     * obligaría a repetir una operación que ya pasó en el mundo real. Se
     * confirma, y se dice que la póliza quedó pendiente.
     */
    const { servicio, activo } = crear({ generado: false, mensaje: 'x' });
    const r: any = await servicio.darDeBaja('af-1', baja, 'e1');

    expect(activo.estado).toBe('VENDIDO');
    expect(r.valorEnLibros).toBe(460000);
    expect(r.resultado).toBe(40000);
    expect(r.tipoResultado).toBe('UTILIDAD');
  });

  it('y si reintentar lanza, tampoco se pierde la baja', async () => {
    const { servicio, asientos, activo } = crear(null);
    asientos.reintentarAhora = jest.fn(async () => {
      throw new Error('el registro no existe');
    });
    const r: any = await servicio.darDeBaja('af-1', baja, 'e1');

    expect(activo.estado).toBe('VENDIDO');
    expect(r.estadoContable).toBe('PENDIENTE');
  });
});
