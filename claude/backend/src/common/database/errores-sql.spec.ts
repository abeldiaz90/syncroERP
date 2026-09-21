import {
  esConflictoDeConcurrencia,
  esViolacionLlaveForanea,
  esViolacionUnicidad,
} from './errores-sql';

/**
 * La prueba que importa es la de PostgreSQL: durante la migración quedaron
 * comprobaciones que sólo conocían los códigos de SQL Server y que por tanto
 * eran siempre falsas contra el motor actual. Un `catch` que no reconoce su
 * error no falla ruidosamente: se lleva la recuperación por delante en
 * silencio.
 */
describe('esViolacionUnicidad', () => {
  it('reconoce el 23505 de PostgreSQL en la raíz', () => {
    expect(esViolacionUnicidad({ code: '23505' })).toBe(true);
  });

  it('reconoce el 23505 cuando TypeORM lo envuelve en driverError', () => {
    expect(
      esViolacionUnicidad({ name: 'QueryFailedError', driverError: { code: '23505' } }),
    ).toBe(true);
  });

  it('sigue reconociendo los códigos de SQL Server', () => {
    expect(esViolacionUnicidad({ number: 2627 })).toBe(true);
    expect(esViolacionUnicidad({ originalError: { info: { number: 2601 } } })).toBe(true);
  });

  it('no confunde otros errores del motor con una clave duplicada', () => {
    expect(esViolacionUnicidad({ code: '23503' })).toBe(false);
    expect(esViolacionUnicidad({ code: '22P02' })).toBe(false);
    expect(esViolacionUnicidad(new Error('timeout'))).toBe(false);
    expect(esViolacionUnicidad(undefined)).toBe(false);
    expect(esViolacionUnicidad(null)).toBe(false);
  });

  it('no se confunde con un código numérico parecido', () => {
    // 23505 como número no debe colarse por la lista de SQL Server.
    expect(esViolacionUnicidad({ number: 23505 })).toBe(true);
    expect(esViolacionUnicidad({ number: 2605 })).toBe(false);
  });
});

describe('esViolacionLlaveForanea', () => {
  it('reconoce los dos motores', () => {
    expect(esViolacionLlaveForanea({ code: '23503' })).toBe(true);
    expect(esViolacionLlaveForanea({ number: 547 })).toBe(true);
    expect(esViolacionLlaveForanea({ code: '23505' })).toBe(false);
  });
});

describe('esConflictoDeConcurrencia', () => {
  it('reconoce serialización e interbloqueo', () => {
    expect(esConflictoDeConcurrencia({ code: '40001' })).toBe(true);
    expect(esConflictoDeConcurrencia({ code: '40P01' })).toBe(true);
    expect(esConflictoDeConcurrencia({ number: 1205 })).toBe(true);
    expect(esConflictoDeConcurrencia({ code: '23505' })).toBe(false);
  });
});
