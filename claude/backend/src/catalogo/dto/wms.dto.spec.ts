import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActualizarUbicacionWmsDto,
  CrearTransferenciaWmsDto,
} from './wms.dto';

describe('DTOs WMS', () => {
  it('rechaza cantidades negativas en una transferencia', async () => {
    const dto = plainToInstance(CrearTransferenciaWmsDto, {
      almacenOrigenId: '11111111-1111-1111-1111-111111111111',
      almacenDestinoId: '22222222-2222-2222-2222-222222222222',
      motivo: 'Reposición',
      detalles: [{
        productoId: '33333333-3333-3333-3333-333333333333',
        ubicacionOrigenId: '44444444-4444-4444-4444-444444444444',
        cantidad: -1,
      }],
    });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza campos de asignación masiva en una ubicación', async () => {
    const dto = plainToInstance(ActualizarUbicacionWmsDto, {
      codigo: 'A-01',
      empresaId: 'empresa-ajena',
      almacenId: 'almacen-ajeno',
    });
    const errores = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errores.some((error) => error.property === 'empresaId')).toBe(true);
    expect(errores.some((error) => error.property === 'almacenId')).toBe(true);
  });
});
