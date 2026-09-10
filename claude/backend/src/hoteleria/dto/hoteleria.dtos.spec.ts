import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgregarConsumoDto, CrearHotelDto } from './hoteleria.dtos';
import {
  CrearConvenioHotelDto,
  RegistrarCobroCityLedgerDto,
} from './city-ledger.dtos';

describe('DTOs de hotelería', () => {
  it('acepta consumo sin precio enviado por el navegador', async () => {
    const dto = plainToInstance(AgregarConsumoDto, {
      productoId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      concepto: 'Agua mineral',
      cantidad: 2,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza el GUID nulo usado antes como producto ficticio', async () => {
    const dto = plainToInstance(AgregarConsumoDto, {
      productoId: '00000000-0000-0000-0000-000000000000',
      concepto: 'Consumo manual',
      cantidad: 1,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('convierte almacén vacío en nulo sin provocar error uniqueidentifier', async () => {
    const dto = plainToInstance(CrearHotelDto, {
      nombre: 'Hotel Centro',
      almacenId: '',
    });
    expect(dto.almacenId).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it('acepta un convenio hotelero completo y acotado', async () => {
    const dto = plainToInstance(CrearConvenioHotelDto, {
      hotelId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      clienteId: '11111111-2222-3333-4444-555555555555',
      numeroConvenio: ' CONV-001 ',
      tipo: 'EMPRESA',
      bloquearConSaldoVencido: true,
      vigenciaDesde: '2026-08-03',
    });
    expect(dto.numeroConvenio).toBe('CONV-001');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza convenios con número o vigencia inválidos', async () => {
    const dto = plainToInstance(CrearConvenioHotelDto, {
      hotelId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      clienteId: '11111111-2222-3333-4444-555555555555',
      numeroConvenio: 'X',
      tipo: 'EMPRESA',
      vigenciaDesde: 'no-es-fecha',
    });
    expect((await validate(dto)).length).toBeGreaterThanOrEqual(2);
  });

  it('acepta un cobro idempotente con cuenta financiera real', async () => {
    const dto = plainToInstance(RegistrarCobroCityLedgerDto, {
      cuentaCobrarId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      importe: 500.25,
      metodoPago: 'TRANSFERENCIA',
      cuentaBancariaId: '11111111-2222-3333-4444-555555555555',
      referencia: ' SPEI-123 ',
      fechaPago: '2026-08-03',
      claveIdempotencia: 'cobro-city-001',
    });
    expect(dto.referencia).toBe('SPEI-123');
    expect(await validate(dto)).toHaveLength(0);
  });
});
