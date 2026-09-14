import { FineractContabilidadAdapter } from './fineract-contabilidad.adapter';

describe('Saldo contable con partidas nativas de Fineract', () => {
  function escenario(pageItems: unknown[]) {
    return new FineractContabilidadAdapter(
      { get: jest.fn().mockResolvedValue({ pageItems }) } as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue({ oficinaContableExterna: '1' }) } as any,
      {} as any,
    );
  }
  it('suma cargos y resta abonos sin depender del campo inexistente debit', async () => {
    const adapter = escenario([{ entryType: { id: 2 }, amount: 600 }, { entryType: { id: 1 }, amount: 200 }]);
    expect(await adapter.saldoCuenta('2', 'empresa', '2026-09-14')).toBe(400);
  });
  it('neutraliza el original reversado con su contrapartida', async () => {
    const adapter = escenario([{ entryType: { id: 2 }, amount: 600, reversed: true }, { entryType: { id: 1 }, amount: 600, reversed: false }]);
    expect(await adapter.saldoCuenta('2', 'empresa', '2026-09-14')).toBe(0);
  });
  it.each([{ amount: 600 }, { entryType: { id: 3 }, amount: 600 }, { entryType: { id: 2 }, amount: 'invalido' }])('rechaza una partida ilegible en vez de inventar saldo: %j', async partida => {
    await expect(escenario([partida]).saldoCuenta('2', 'empresa', '2026-09-14')).rejects.toThrow();
  });
});
