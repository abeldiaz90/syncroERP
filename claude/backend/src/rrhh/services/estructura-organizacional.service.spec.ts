import { ForbiddenException } from '@nestjs/common';
import { EstructuraOrganizacionalService } from './estructura-organizacional.service';
import { EstadoSolicitudEstructura, TipoSolicitudEstructura } from '../entities/solicitud-estructura.entity';

describe('EstructuraOrganizacionalService', () => {
  const usuario = { id: 'usuario-rh', empresaId: 'empresa-1', rol: 'rrhh' };
  const solicitudBase = {
    id: 'sol-1', empresaId: 'empresa-1', tipo: TipoSolicitudEstructura.PUESTO,
    nombreSolicitado: 'Contralor', estado: EstadoSolicitudEstructura.PENDIENTE_GERENCIA,
    datosJson: JSON.stringify({ tipo: 'PUESTO', nombre: 'Contralor', clave: 'FIN-CON', departamentoId: 'area-fin', salarioMinimo: 1000, salarioMaximo: 1800, plazasAutorizadas: 1 }),
  } as any;

  function crear(overrides: Record<string, any> = {}) {
    const solicitudes: any = {
      findOne: jest.fn(async () => ({ ...solicitudBase })),
      find: jest.fn(async () => []),
      save: jest.fn(async (x) => x),
      create: jest.fn((x) => x),
      createQueryBuilder: jest.fn(),
      ...overrides.solicitudes,
    };
    const departamentos: any = { findOne: jest.fn(async () => ({ id: 'area-fin', nombre: 'Finanzas', activo: true })) };
    const puestos: any = {};
    const configuraciones = { findOne: jest.fn(async () => null), count: jest.fn(async () => 0) };
    const dataSource: any = { transaction: jest.fn(), getRepository: jest.fn(() => configuraciones) };
    return { service: new EstructuraOrganizacionalService(solicitudes, departamentos, puestos, dataSource), solicitudes, departamentos, dataSource };
  }

  it('exige que Recursos Humanos o Gerencia creen solicitudes', async () => {
    const { service } = crear();
    await expect(service.crear({ tipo: TipoSolicitudEstructura.AREA, nombre: 'Legal', motivo: 'Necesidad de control jurídico' }, { ...usuario, rol: 'empleado' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('la aprobación de Gerencia sólo avanza a Finanzas y no crea el puesto', async () => {
    const { service, solicitudes, dataSource } = crear();
    const resultado = await service.resolver('sol-1', 'GERENCIA', { decision: 'APROBAR' }, { id: 'gerente-1', empresaId: 'empresa-1', rol: 'gerencia' });
    expect(resultado.estado).toBe(EstadoSolicitudEstructura.PENDIENTE_FINANZAS);
    expect(resultado.aprobadoGerenciaPorId).toBe('gerente-1');
    expect(solicitudes.save).toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('impide que la misma persona cubra ambas aprobaciones salvo administrador', async () => {
    const { service, solicitudes } = crear();
    solicitudes.findOne.mockResolvedValue({ ...solicitudBase, estado: EstadoSolicitudEstructura.PENDIENTE_FINANZAS, aprobadoGerenciaPorId: 'usuario-1' });
    await expect(service.resolver('sol-1', 'FINANZAS', { decision: 'APROBAR' }, { id: 'usuario-1', empresaId: 'empresa-1', rol: 'finanzas' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requiere comentario para rechazar', async () => {
    const { service } = crear();
    await expect(service.resolver('sol-1', 'GERENCIA', { decision: 'RECHAZAR' }, { id: 'gerente-1', empresaId: 'empresa-1', rol: 'gerencia' }))
      .rejects.toThrow('Explica el motivo del rechazo');
  });
});
