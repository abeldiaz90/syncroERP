import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';

describe('ProveedoresService - homologación', () => {
  const proveedorRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (valor) => valor),
  };
  const service = new ProveedoresService(
    proveedorRepo as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rechaza la homologación por un rol no autorizado', async () => {
    await expect(
      service.resolverHomologacion(
        'proveedor',
        { estado: 'APROBADO', nivelRiesgo: 'BAJO' },
        'empresa',
        'usuario',
        'almacenista',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige justificación para condicionar o bloquear', async () => {
    proveedorRepo.findOne.mockResolvedValue({
      id: 'proveedor',
      empresaId: 'empresa',
      estadoHomologacion: 'EN_EVALUACION',
    });
    await expect(
      service.resolverHomologacion(
        'proveedor',
        { estado: 'BLOQUEADO', nivelRiesgo: 'ALTO' },
        'empresa',
        'compras-1',
        'compras',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registra estado, riesgo, actor y fecha de la resolución', async () => {
    proveedorRepo.findOne.mockResolvedValue({
      id: 'proveedor',
      empresaId: 'empresa',
      estadoHomologacion: 'EN_EVALUACION',
    });
    const resultado = await service.resolverHomologacion(
      'proveedor',
      { estado: 'CONDICIONADO', nivelRiesgo: 'MEDIO', comentario: 'Revisar trimestralmente' },
      'empresa',
      'compras-1',
      'comprador',
    );
    expect(resultado.estadoHomologacion).toBe('CONDICIONADO');
    expect(resultado.homologacionResueltaPorId).toBe('compras-1');
    expect(resultado.fechaResolucionHomologacion).toBeInstanceOf(Date);
  });
});
