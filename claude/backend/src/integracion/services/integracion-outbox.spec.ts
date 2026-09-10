import { esperaDeReintento } from './integracion-outbox.service';

describe('esperaDeReintento', () => {
  it('empieza corto: un reinicio del proveedor se recupera solo', () => {
    expect(esperaDeReintento(1)).toBe(5_000);
    expect(esperaDeReintento(2)).toBe(10_000);
    expect(esperaDeReintento(3)).toBe(20_000);
  });

  it('crece de forma exponencial', () => {
    expect(esperaDeReintento(5)).toBe(80_000);
  });

  it('tiene techo de una hora para no atascar el despachador', () => {
    expect(esperaDeReintento(20)).toBe(3_600_000);
    expect(esperaDeReintento(100)).toBe(3_600_000);
  });

  it('tolera un contador en cero', () => {
    expect(esperaDeReintento(0)).toBe(5_000);
  });
});
