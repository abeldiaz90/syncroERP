import { ConflictException } from '@nestjs/common';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { PoliticaCreditoService } from './politica-credito.service';

const cliente = (extra: Partial<Cliente> = {}) =>
  ({
    id: 'cliente-1',
    empresaId: 'empresa-1',
    activo: true,
    estadoCredito: 'AUTORIZADO',
    limiteCredito: 100_000,
    diasCredito: 30,
    versionCredito: 3,
    ...extra,
  }) as Cliente;

function managerCon(datos: {
  cliente?: Cliente;
  saldoVentas?: number;
  saldoHotel?: number;
  vencidoVentas?: number;
  vencidoHotel?: number;
}) {
  const qb: any = {
    where: jest.fn(() => qb),
    setLock: jest.fn(() => qb),
    getOne: jest.fn(async () => datos.cliente ?? cliente()),
  };
  return {
    getRepository: jest.fn(() => ({
      createQueryBuilder: jest.fn(() => qb),
    })),
    query: jest
      .fn()
      .mockResolvedValueOnce([{ resultado: 0 }])
      .mockResolvedValueOnce([
        {
          saldoVentas: datos.saldoVentas ?? 0,
          saldoHotel: datos.saldoHotel ?? 0,
          vencidoVentas: datos.vencidoVentas ?? 0,
          vencidoHotel: datos.vencidoHotel ?? 0,
        },
      ]),
  };
}

describe('PoliticaCreditoService', () => {
  it('suma ventas y City Ledger antes de autorizar una operación', async () => {
    const manager = managerCon({ saldoVentas: 30_000, saldoHotel: 20_000 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    const resultado = await servicio.validarOperacionEnTransaccion(
      manager as never,
      {
        empresaId: 'empresa-1',
        clienteId: 'cliente-1',
        importe: 40_000,
        fechaCorte: '2026-08-03',
      },
    );
    expect(resultado.utilizado).toBe(50_000);
    expect(resultado.disponible).toBe(50_000);
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('sp_getapplock'),
      ['LINEA_CREDITO:empresa-1:cliente-1'],
    );
  });

  it('impide que ventas y hotelería excedan conjuntamente la línea', async () => {
    const manager = managerCon({ saldoVentas: 70_000, saldoHotel: 20_000 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    await expect(
      servicio.validarOperacionEnTransaccion(manager as never, {
        empresaId: 'empresa-1',
        clienteId: 'cliente-1',
        importe: 15_000,
        fechaCorte: '2026-08-03',
      }),
    ).rejects.toThrow('Crédito global insuficiente');
  });

  it('bloquea por cartera vencida de cualquier canal', async () => {
    const manager = managerCon({ vencidoHotel: 1_500 });
    const servicio = new PoliticaCreditoService({ manager } as never);
    await expect(
      servicio.validarOperacionEnTransaccion(manager as never, {
        empresaId: 'empresa-1',
        clienteId: 'cliente-1',
        importe: 1_000,
        fechaCorte: '2026-08-03',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
