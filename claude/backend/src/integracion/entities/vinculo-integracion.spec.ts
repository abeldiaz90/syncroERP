import { referenciaDe } from './vinculo-integracion.entity';
import { TipoVinculo } from '../integracion.constants';

describe('referenciaDe', () => {
  it('es determinista: es la llave de idempotencia contra el proveedor', () => {
    const a = referenciaDe(TipoVinculo.CREDITO, 'abc-123');
    const b = referenciaDe(TipoVinculo.CREDITO, 'abc-123');
    expect(a).toBe(b);
    expect(a).toBe('syncro:credito:abc-123');
  });

  it('no colisiona entre tipos con el mismo id', () => {
    expect(referenciaDe(TipoVinculo.CLIENTE, 'x')).not.toBe(
      referenciaDe(TipoVinculo.CREDITO, 'x'),
    );
  });
});
