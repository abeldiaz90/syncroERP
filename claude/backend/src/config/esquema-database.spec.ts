import { debeEjecutarMigraciones, debeSincronizarEsquema } from './esquema-database';

describe('debeSincronizarEsquema', () => {
  it('permite construir una base local cuando DB_SYNC está habilitado', () => {
    expect(debeSincronizarEsquema('development', 'true')).toBe(true);
  });

  it('no modifica el esquema local cuando DB_SYNC está deshabilitado', () => {
    expect(debeSincronizarEsquema('development', 'false')).toBe(false);
  });

  it('bloquea synchronize en producción aunque DB_SYNC sea true', () => {
    expect(debeSincronizarEsquema('production', 'true')).toBe(false);
  });
});


describe('debeEjecutarMigraciones', () => {
  it('sólo las habilita mediante DB_MIGRATIONS_RUN=true', () => {
    expect(debeEjecutarMigraciones('production', 'true')).toBe(true);
    expect(debeEjecutarMigraciones('development', 'false')).toBe(false);
  });
});
