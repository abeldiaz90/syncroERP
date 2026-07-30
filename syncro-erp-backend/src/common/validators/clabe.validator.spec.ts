import { claveBancoDeClabe, esClabeValida } from './clabe.validator';

describe('CLABE', () => {
  it('valida longitud, contenido y dígito verificador', () => {
    expect(esClabeValida('012180001234567899')).toBe(true);
    expect(esClabeValida('012180001234567898')).toBe(false);
    expect(esClabeValida('01218000123456789')).toBe(false);
    expect(esClabeValida('01218000123456789A')).toBe(false);
  });

  it('extrae la clave de institución', () => {
    expect(claveBancoDeClabe('012180001234567899')).toBe('012');
  });
});
