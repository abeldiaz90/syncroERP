import { clabeEsValida } from './clabe.util';

describe('clabeEsValida', () => {
  it('acepta una CLABE con dígito verificador correcto', () => {
    expect(clabeEsValida('032180000118359719')).toBe(true);
  });

  it('rechaza una CLABE con dígito verificador alterado', () => {
    expect(clabeEsValida('032180000118359718')).toBe(false);
  });

  it('rechaza longitud distinta de 18', () => {
    expect(clabeEsValida('123')).toBe(false);
  });
});
