import { ForbiddenException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

const qbBloqueo = (cliente: any) => {
  const qb: any = {
    setLock: jest.fn(() => qb),
    where: jest.fn(() => qb),
    getOne: jest.fn(async () => cliente),
  };
  return qb;
};

describe('ClientesService - gobierno central de crédito', () => {
  const clienteRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (valor) => valor),
    createQueryBuilder: jest.fn(),
  };
  const aprobaciones = {
    exigirConfiguracion: jest.fn(async () => undefined),
    prepararEnTransaccion: jest.fn(async () => []),
    cancelarPendientesEnTransaccion: jest.fn(async () => undefined),
  };
  const manager = {
    getRepository: jest.fn(() => ({
      createQueryBuilder: jest.fn(),
      save: jest.fn(async (valor) => valor),
    })),
    save: jest.fn(async (valor) => valor),
    query: jest.fn(async () => []),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  const service = new ClientesService(
    clienteRepo as any,
    {} as any,
    {} as any,
    dataSource as any,
    aprobaciones as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    manager.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn(),
      save: jest.fn(async (valor) => valor),
    });
  });

  it('impide que un rol operativo suspenda o reenvíe crédito', async () => {
    await expect(
      service.gestionarCredito(
        'cliente',
        { decision: 'REENVIAR' },
        'empresa',
        'usuario',
        'vendedor',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('impide reenviar una línea que ya está en revisión', async () => {
    clienteRepo.findOne.mockResolvedValue({
      id: 'cliente',
      empresaId: 'empresa',
      limiteCredito: 10_000,
      diasCredito: 30,
      estadoCredito: 'AUTORIZADO',
      estadoSolicitudCredito: 'PENDIENTE',
    });
    await expect(
      service.gestionarCredito(
        'cliente',
        { decision: 'REENVIAR' },
        'empresa',
        'finanzas-1',
        'finanzas',
      ),
    ).rejects.toThrow('Bandeja central de aprobaciones');
  });

  it('reenvía una línea suspendida mediante un nuevo ciclo de aprobación', async () => {
    const cliente = {
      id: 'cliente',
      empresaId: 'empresa',
      limiteCredito: 10_000,
      diasCredito: 30,
      estadoCredito: 'SUSPENDIDO',
      estadoSolicitudCredito: 'APROBADA',
      versionSolicitudCredito: 1,
      nivelRiesgo: 'MEDIO',
      bloquearCreditoConSaldoVencido: true,
      clasificacionHotelera: 'EMPRESA',
    };
    clienteRepo.findOne.mockResolvedValue(cliente);
    /*
     * `getRepository` está tipado por el mock de arriba, que declara también
     * `save`. Omitirlo aquí rompía la compilación de toda la suite (TS2345) y
     * la dejaba sin ejecutar: 8 pruebas de crédito de clientes llevaban tiempo
     * sin correr aunque el reporte sólo mostrara «1 suite failed».
     */
    manager.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn(() => qbBloqueo(cliente)),
      save: jest.fn(async (valor: unknown) => valor),
    });

    const resultado = await service.gestionarCredito(
      'cliente',
      { decision: 'REENVIAR', comentario: 'Documentación completada' },
      'empresa',
      'finanzas-1',
      'finanzas',
    );

    expect(resultado.estadoCredito).toBe('SUSPENDIDO');
    expect(resultado.estadoSolicitudCredito).toBe('PENDIENTE');
    expect(resultado.limiteCreditoSolicitado).toBe(10_000);
    expect(resultado.diasCreditoSolicitados).toBe(30);
    expect(aprobaciones.cancelarPendientesEnTransaccion).toHaveBeenCalled();
    expect(aprobaciones.prepararEnTransaccion).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        proceso: 'CREDITO_CLIENTE',
        documentoId: 'cliente',
        solicitadoPorId: 'finanzas-1',
      }),
    );
  });

  it('crea una propuesta sin reemplazar la línea autorizada vigente', async () => {
    const cliente = {
      id: 'cliente',
      empresaId: 'empresa',
      nombre: 'Cliente prueba',
      tipoPersona: 'MORAL',
      rfc: '',
      activo: true,
      limiteCredito: 10_000,
      diasCredito: 30,
      estadoCredito: 'AUTORIZADO',
      nivelRiesgo: 'MEDIO',
      bloquearCreditoConSaldoVencido: true,
      clasificacionHotelera: 'EMPRESA',
      versionCredito: 1,
      estadoSolicitudCredito: 'APROBADA',
      versionSolicitudCredito: 1,
    };
    clienteRepo.findOne.mockResolvedValue(cliente);
    manager.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn(() => qbBloqueo(cliente)),
      save: jest.fn(async (valor) => valor),
    });

    const resultado = await service.actualizar(
      'cliente',
      {
        limiteCredito: 15_000,
        diasCredito: 45,
        nivelRiesgo: 'BAJO',
        bloquearCreditoConSaldoVencido: true,
        clasificacionHotelera: 'AGENCIA',
      },
      'empresa',
      'finanzas-1',
    );

    expect(resultado.estadoCredito).toBe('AUTORIZADO');
    expect(resultado.limiteCredito).toBe(10_000);
    expect(resultado.diasCredito).toBe(30);
    expect(resultado.estadoSolicitudCredito).toBe('PENDIENTE');
    expect(resultado.limiteCreditoSolicitado).toBe(15_000);
    expect(resultado.diasCreditoSolicitados).toBe(45);
    expect(resultado.versionSolicitudCredito).toBe(2);
    expect(aprobaciones.prepararEnTransaccion).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        proceso: 'CREDITO_CLIENTE',
        monto: 15_000,
        documentoVersion: 2,
      }),
    );
  });

});
