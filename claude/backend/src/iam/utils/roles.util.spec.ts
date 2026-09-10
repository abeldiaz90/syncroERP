import { esRolAdministrador, normalizarRol } from './roles.util';

describe('normalización segura de roles', () => {
  it.each([
    ['Ventas', 'VENTAS'],
    ['recursos-humanos', 'RECURSOS_HUMANOS'],
    ['Súper administrador', 'SUPER_ADMINISTRADOR'],
  ])('normaliza %s de forma determinista', (entrada, esperado) => {
    expect(normalizarRol(entrada)).toBe(esperado);
  });

  it('reconoce variantes históricas de administrador', () => {
    expect(esRolAdministrador('administrador')).toBe(true);
    expect(esRolAdministrador('SUPER-ADMIN')).toBe(true);
  });

  it('no eleva un rol con texto parecido', () => {
    expect(esRolAdministrador('administracion')).toBe(false);
    expect(esRolAdministrador('ventas_admin')).toBe(false);
  });
});
