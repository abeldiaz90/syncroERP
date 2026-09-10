import { decimalNumberTransformer } from './decimal-number.transformer';

describe('decimalNumberTransformer', () => {
  it('convierte el decimal de SQL Server a number', () => {
    expect(decimalNumberTransformer.from('100.2500')).toBe(100.25);
    expect(decimalNumberTransformer.from(0)).toBe(0);
  });

  it('conserva null y undefined', () => {
    expect(decimalNumberTransformer.from(null)).toBeNull();
    expect(decimalNumberTransformer.from(undefined)).toBeUndefined();
  });

  it('rechaza valores decimales inválidos en lugar de concatenarlos', () => {
    expect(() => decimalNumberTransformer.from('100.00x')).toThrow(
      'Valor DECIMAL inválido',
    );
  });

  it('no altera el valor enviado al controlador de SQL Server', () => {
    expect(decimalNumberTransformer.to(125.75)).toBe(125.75);
  });
});
