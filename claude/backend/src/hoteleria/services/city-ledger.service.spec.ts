import { CityLedgerService } from './city-ledger.service';
import {
  ConvenioCreditoHotel,
  CuentaCobrarHotel,
  EstadoConvenioHotel,
  TipoConvenioHotel,
} from '../entities/city-ledger.entity';
import { MetodoPagoHotel } from '../entities/folio.entity';

describe('CityLedgerService: autorización de crédito', () => {
  const crearServicio = (politicaCredito?: {
    validarOperacionEnTransaccion: jest.Mock;
  }) => {
    const politica =
      politicaCredito ??
      ({
        validarOperacionEnTransaccion: jest.fn(async () => ({
          limite: 10_000,
          disponible: 10_000,
          utilizado: 0,
          vencido: 0,
          diasCredito: 30,
          versionCredito: 1,
        })),
      } as const);
    const servicio = new CityLedgerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      politica as never,
    );
    jest
      .spyOn(servicio, 'verificarPreparacionProduccion')
      .mockResolvedValue({ listo: true, bloqueos: [] } as never);
    return { servicio, politica };
  };

  const datos = {
    empresaId: 'empresa-1',
    hotelId: 'hotel-1',
    reservacionId: 'reserva-1',
    huespedClienteId: 'huesped-1',
    folioId: 'folio-1',
    folioReferencia: 'RES-00000001',
    convenioId: 'convenio-1',
    metodoPago: MetodoPagoHotel.CREDITO_EMPRESA,
    moneda: 'MXN',
    subtotal: 1_000,
    iva: 160,
    impuestoHospedaje: 50,
    total: 1_210,
    fechaEmision: '2026-08-03',
  };

  const convenio = (extra: Partial<ConvenioCreditoHotel> = {}) =>
    ({
      id: 'convenio-1',
      empresaId: 'empresa-1',
      hotelId: 'hotel-1',
      clienteId: 'empresa-cliente-1',
      numeroConvenio: 'CONV-001',
      version: 3,
      versionCreditoCliente: 1,
      tipo: TipoConvenioHotel.EMPRESA,
      estado: EstadoConvenioHotel.APROBADO,
      activo: true,
      limiteCredito: 10_000,
      tolerancia: 0,
      diasCredito: 30,
      bloquearConSaldoVencido: true,
      vigenciaDesde: '2026-01-01',
      vigenciaHasta: null,
      ...extra,
    }) as ConvenioCreditoHotel;

  function managerPara(actual: ConvenioCreditoHotel, saldo = 0, vencido = 0) {
    const guardar = jest.fn(async (valor) => ({ id: 'cxc-1', ...valor }));
    const cuentaRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((valor) => valor),
      save: guardar,
    };
    const convenioRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          setLock: () => qb,
          where: () => qb,
          getOne: async () => actual,
        };
        return qb;
      }),
    };
    const clienteRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          setLock: () => qb,
          where: () => qb,
          getOne: async () => ({
            id: actual.clienteId,
            empresaId: actual.empresaId,
            activo: true,
            estadoCredito: 'AUTORIZADO',
            limiteCredito: actual.limiteCredito,
            diasCredito: actual.diasCredito,
          }),
        };
        return qb;
      }),
    };
    return {
      manager: {
        getRepository: jest.fn((entidad) => {
          if (entidad === CuentaCobrarHotel) return cuentaRepo;
          if (entidad === ConvenioCreditoHotel) return convenioRepo;
          return clienteRepo;
        }),
        query: jest.fn(async () => [
          { saldoHotel: saldo, saldoVentas: 0, vencidoHotel: vencido },
        ]),
      },
      guardar,
    };
  }

  it('crea la cuenta por cobrar y calcula su vencimiento', async () => {
    const { servicio } = crearServicio();
    const { manager, guardar } = managerPara(convenio());
    const cuenta = await servicio.crearCuentaDesdeCheckout(
      manager as never,
      datos,
    );
    expect(cuenta).toEqual(expect.objectContaining({ id: 'cxc-1' }));
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 'empresa-cliente-1',
        convenioVersion: 3,
        numeroConvenioSnapshot: 'CONV-001',
        tipoConvenioSnapshot: TipoConvenioHotel.EMPRESA,
        limiteCreditoAplicado: 10_000,
        diasCreditoAplicados: 30,
        versionCreditoClienteAplicada: 1,
        importeOriginal: 1_210,
        saldoPendiente: 1_210,
        fechaVencimiento: '2026-09-02',
      }),
    );
  });

  it('delega el límite global a la política única de crédito', async () => {
    const politica = {
      validarOperacionEnTransaccion: jest.fn(async () => {
        throw new Error('Crédito global insuficiente');
      }),
    };
    const { servicio } = crearServicio(politica);
    const { manager } = managerPara(convenio());
    await expect(
      servicio.crearCuentaDesdeCheckout(manager as never, datos),
    ).rejects.toThrow('Crédito global insuficiente');
    expect(politica.validarOperacionEnTransaccion).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        clienteId: 'empresa-cliente-1',
        importe: 1_210,
      }),
    );
  });

  it('rechaza el cierre cuando la política global detecta cartera vencida', async () => {
    const politica = {
      validarOperacionEnTransaccion: jest.fn(async () => {
        throw new Error('El cliente tiene saldos vencidos');
      }),
    };
    const { servicio } = crearServicio(politica);
    const { manager } = managerPara(convenio());
    await expect(
      servicio.crearCuentaDesdeCheckout(manager as never, datos),
    ).rejects.toThrow('saldos vencidos');
  });

  it('rechaza un convenio de agencia usado como crédito empresa', async () => {
    const { servicio } = crearServicio();
    const { manager } = managerPara(
      convenio({ tipo: TipoConvenioHotel.AGENCIA }),
    );
    await expect(
      servicio.crearCuentaDesdeCheckout(manager as never, datos),
    ).rejects.toThrow('no está aprobado o no corresponde');
  });

  it('reclasifica IVA proporcional en cobros parciales y absorbe el residuo al liquidar', () => {
    const { servicio } = crearServicio();
    expect(
      (servicio as any).calcularIvaReclasificado(605, 1_210, 1_210, 160, 0),
    ).toBe(80);
    expect(
      (servicio as any).calcularIvaReclasificado(605, 605, 1_210, 160, 80),
    ).toBe(80);
  });

  it('nunca reclasifica más IVA que el pendiente por redondeo', () => {
    const { servicio } = crearServicio();
    expect(
      (servicio as any).calcularIvaReclasificado(0.01, 10, 116, 16, 15.99),
    ).toBe(0);
    expect(
      (servicio as any).calcularIvaReclasificado(10, 10, 116, 16, 15.99),
    ).toBe(0.01);
  });

  it('bloquea producción cuando faltan tablas, columnas o roles contables', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            convenios: 0,
            cartera: 0,
            cobros: 0,
            totalCredito: 0,
            enlaceCuenta: 0,
            enlaceConvenio: 0,
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const servicio = new CityLedgerService(
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const resultado =
      await servicio.verificarPreparacionProduccion('empresa-1');
    expect(resultado.listo).toBe(false);
    expect(resultado.bloqueos).toEqual(
      expect.arrayContaining([
        'Falta la tabla de convenios hoteleros.',
        'Falta una cuenta contable afectable con rol CLIENTES_CXC.',
      ]),
    );
  });
});
