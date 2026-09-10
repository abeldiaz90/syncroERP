import { OperacionHotelService } from './operacion-hotel.service';
import { Hotel } from '../entities/hotel.entity';

describe('OperacionHotelService: reglas de cobro', () => {
  const servicio = new OperacionHotelService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const hotel = (incluidos = true) =>
    ({
      tasaIva: 16,
      tasaImpuestoHospedaje: 5,
      preciosIncluyenImpuestos: incluidos,
    }) as Hotel;

  it('desglosa una tarifa con IVA e impuesto sobre hospedaje incluidos', () => {
    const resultado = (servicio as any).desglosarImporte(1_000, 1, hotel(true));
    expect(resultado).toEqual({
      subtotal: 826.45,
      iva: 132.23,
      impuestoHospedaje: 41.32,
      total: 1_000,
    });
  });

  it('no aplica impuesto sobre hospedaje a consumos', () => {
    const resultado = (servicio as any).desglosarImporte(
      1_000,
      1,
      hotel(true),
      { tasaIva: 16, aplicarImpuestoHospedaje: false },
    );
    expect(resultado).toEqual({
      subtotal: 862.07,
      iva: 137.93,
      impuestoHospedaje: 0,
      total: 1_000,
    });
  });

  it('agrega los impuestos cuando la tarifa no los incluye', () => {
    const resultado = (servicio as any).desglosarImporte(
      1_000,
      1,
      hotel(false),
    );
    expect(resultado).toEqual({
      subtotal: 1_000,
      iva: 160,
      impuestoHospedaje: 50,
      total: 1_210,
    });
  });

  it('calcula noches por fecha calendario sin depender del horario local', () => {
    expect((servicio as any).noches('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('mapea el total calculado al campo obligatorio importe del cargo', () => {
    expect(
      (servicio as any).camposCargo({
        subtotal: 862.07,
        iva: 137.93,
        impuestoHospedaje: 0,
        total: 1_000,
      }),
    ).toEqual({
      subtotal: 862.07,
      iva: 137.93,
      impuestoHospedaje: 0,
      importe: 1_000,
    });
  });

  it('repara valores faltantes de un hotel creado con la versión anterior', async () => {
    const legado = {
      id: 'hotel-1',
      empresaId: 'empresa-1',
      activo: true,
      moneda: null,
      zonaHoraria: null,
      tasaIva: null,
      preciosIncluyenImpuestos: null,
    } as unknown as Hotel;
    const guardar = jest.fn(async (valor) => valor);
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async () => legado),
        save: guardar,
      })),
    };

    const resultado = await (servicio as any).hotelOrFail(
      manager,
      'hotel-1',
      'empresa-1',
    );

    expect(resultado.moneda).toBe('MXN');
    expect(resultado.zonaHoraria).toBe('America/Mexico_City');
    expect(resultado.tasaIva).toBe(16);
    expect(resultado.preciosIncluyenImpuestos).toBe(true);
    expect(guardar).toHaveBeenCalledWith(legado);
  });

  it('impide cerrar a crédito sin un convenio aprobado seleccionado', async () => {
    await expect(
      (servicio as any).validarPagos(
        {},
        [
          {
            metodoPago: 'CREDITO_EMPRESA',
            importe: 1_000,
          },
        ],
        'empresa-1',
        1_000,
        'MXN',
      ),
    ).rejects.toThrow('Selecciona un convenio aprobado');
  });
});
