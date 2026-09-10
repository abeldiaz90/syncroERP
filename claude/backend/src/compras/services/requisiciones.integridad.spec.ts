import { BadRequestException } from '@nestjs/common';
import { RequisicionesService } from './requisiciones.service';

describe('RequisicionesService - integridad del flujo', () => {
  const reqRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (valor) => valor),
  };
  const service = new RequisicionesService(
    reqRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    reqRepo.findOne.mockResolvedValue({
      id: 'req',
      empresaId: 'empresa',
      usuarioSolicitanteId: 'solicitante',
      estado: 'PENDIENTE',
    });
  });

  it('no permite saltar la aprobación cambiando a COTIZANDO', async () => {
    await expect(
      service.cambiarEstado('req', 'empresa', 'COTIZANDO', 'solicitante', 'empleado'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conserva la cancelación como transición operativa válida', async () => {
    const resultado = await service.cambiarEstado(
      'req',
      'empresa',
      'CANCELADA',
      'solicitante',
      'empleado',
    );
    expect(resultado.estado).toBe('CANCELADA');
  });
});
