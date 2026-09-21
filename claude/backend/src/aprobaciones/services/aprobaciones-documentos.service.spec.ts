import { AprobacionesDocumentosService } from './aprobaciones-documentos.service';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { ConvenioCreditoHotel } from '../../hoteleria/entities/city-ledger.entity';
import { AprobacionDocumento } from '../../compras/entities/aprobacion-documento.entity';

const qbCliente = (cliente: any) => {
  const qb: any = {
    setLock: jest.fn(() => qb),
    where: jest.fn(() => qb),
    getOne: jest.fn(async () => cliente),
  };
  return qb;
};

const qbActualizacion = () => {
  const qb: any = {
    update: jest.fn(() => qb),
    set: jest.fn(() => qb),
    where: jest.fn(() => qb),
    execute: jest.fn(async () => ({ affected: 1 })),
  };
  return qb;
};

describe('AprobacionesDocumentosService - maker checker de crédito', () => {
  const crearServicio = () =>
    new AprobacionesDocumentosService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      // El publicador de cartera: la aprobación escribe el hecho en el outbox.
      // Se deja como espía para comprobar que el maker-checker lo invoca sin
      // hablar con ningún sistema externo.
      { lineaAutorizada: jest.fn(async () => undefined) } as any,
      // El motor de validación. Sin flujo activo la puerta no se aplica, que
      // es el comportamiento de una empresa que no ha configurado ninguno.
      { flujoActivo: jest.fn(async () => null), historial: jest.fn(async () => []) } as any,
    );

  const aprobacion = {
    proceso: 'CREDITO_CLIENTE',
    documentoId: 'cliente',
    empresaId: 'empresa',
    documentoVersion: 2,
    importeSolicitado: 15_000,
    datosSolicitud: JSON.stringify({
      limiteCredito: 15_000,
      diasCredito: 45,
      nivelRiesgo: 'BAJO',
      bloquearCreditoConSaldoVencido: true,
      clasificacionHotelera: 'AGENCIA',
      versionSolicitudCredito: 2,
    }),
  } as AprobacionDocumento;

  it('aplica la propuesta sólo al terminar el último nivel', async () => {
    const cliente: any = {
      id: 'cliente',
      empresaId: 'empresa',
      activo: true,
      tipoPersona: 'MORAL',
      limiteCredito: 10_000,
      diasCredito: 30,
      estadoCredito: 'AUTORIZADO',
      nivelRiesgo: 'MEDIO',
      bloquearCreditoConSaldoVencido: true,
      clasificacionHotelera: 'EMPRESA',
      versionCredito: 1,
      estadoSolicitudCredito: 'PENDIENTE',
      limiteCreditoSolicitado: 15_000,
      diasCreditoSolicitados: 45,
      nivelRiesgoSolicitado: 'BAJO',
      bloquearCreditoConSaldoVencidoSolicitado: true,
      clasificacionHoteleraSolicitada: 'AGENCIA',
      versionSolicitudCredito: 2,
    };
    const convenioUpdate = qbActualizacion();
    const aprobacionUpdate = qbActualizacion();
    const manager: any = {
      save: jest.fn(async (valor) => valor),
      getRepository: jest.fn((entidad) => {
        if (entidad === Cliente) {
          return { createQueryBuilder: jest.fn(() => qbCliente(cliente)) };
        }
        if (entidad === ConvenioCreditoHotel) {
          return { createQueryBuilder: jest.fn(() => convenioUpdate) };
        }
        if (entidad === AprobacionDocumento) {
          return { createQueryBuilder: jest.fn(() => aprobacionUpdate) };
        }
        throw new Error('Repositorio no contemplado en la prueba');
      }),
    };

    await (crearServicio() as any).finalizarDocumento(
      manager,
      aprobacion,
      true,
      'aprobador-final',
      'Aprobado por comité',
    );

    expect(cliente.estadoCredito).toBe('AUTORIZADO');
    expect(cliente.estadoSolicitudCredito).toBe('APROBADA');
    expect(cliente.limiteCredito).toBe(15_000);
    expect(cliente.diasCredito).toBe(45);
    expect(cliente.versionCredito).toBe(2);
    expect(cliente.limiteCreditoSolicitado).toBeNull();
    expect(cliente.diasCreditoSolicitados).toBeNull();
    expect(convenioUpdate.execute).toHaveBeenCalledTimes(2);
    expect(aprobacionUpdate.execute).toHaveBeenCalledTimes(1);
  });

  it('rechaza la propuesta sin destruir la línea vigente', async () => {
    const cliente: any = {
      id: 'cliente',
      empresaId: 'empresa',
      activo: true,
      tipoPersona: 'MORAL',
      limiteCredito: 10_000,
      diasCredito: 30,
      estadoCredito: 'AUTORIZADO',
      nivelRiesgo: 'MEDIO',
      bloquearCreditoConSaldoVencido: true,
      clasificacionHotelera: 'EMPRESA',
      versionCredito: 1,
      estadoSolicitudCredito: 'PENDIENTE',
      limiteCreditoSolicitado: 15_000,
      diasCreditoSolicitados: 45,
      nivelRiesgoSolicitado: 'BAJO',
      bloquearCreditoConSaldoVencidoSolicitado: true,
      clasificacionHoteleraSolicitada: 'AGENCIA',
      versionSolicitudCredito: 2,
    };
    const manager: any = {
      save: jest.fn(async (valor) => valor),
      getRepository: jest.fn((entidad) => {
        if (entidad === Cliente) {
          return { createQueryBuilder: jest.fn(() => qbCliente(cliente)) };
        }
        throw new Error('Repositorio no contemplado en la prueba');
      }),
    };

    await (crearServicio() as any).finalizarDocumento(
      manager,
      aprobacion,
      false,
      'aprobador-1',
      'Capacidad de pago insuficiente',
    );

    expect(cliente.estadoCredito).toBe('AUTORIZADO');
    expect(cliente.limiteCredito).toBe(10_000);
    expect(cliente.diasCredito).toBe(30);
    expect(cliente.versionCredito).toBe(1);
    expect(cliente.estadoSolicitudCredito).toBe('RECHAZADA');
    expect(cliente.limiteCreditoSolicitado).toBe(15_000);
    expect(cliente.diasCreditoSolicitados).toBe(45);
  });
});
