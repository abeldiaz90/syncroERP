import { IsNull } from 'typeorm';
import { AvisosIntegracionService } from './avisos-integracion.service';

describe('Avisos sin empresa', () => {
  it('usa IS NULL explícito: TypeORM omite el filtro si se pasa null', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const service = new AvisosIntegracionService({ find } as any, {} as any, {} as any);
    await service.listarHuerfanos();
    expect(find).toHaveBeenCalledWith({ where: { empresaId: IsNull() }, order: { recibidoEn: 'DESC' }, take: 100 });
  });
});
