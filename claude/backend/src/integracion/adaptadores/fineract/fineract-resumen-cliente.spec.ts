import { FineractCarteraAdapter } from './fineract-cartera.adapter';

describe('Resumen de cartera Fineract', () => {
  function crear() {
    const get = jest.fn();
    const adapter = new FineractCarteraAdapter({ get } as any, { timeoutPosMs: 2000 } as any, {} as any, {} as any);
    return { get, adapter };
  }
  it('consulta los saldos del detalle cuando accounts no contiene summary', async () => {
    const { get, adapter } = crear();
    get.mockResolvedValueOnce({ loanAccounts: [{ id: 5, status: { active: true } }, { id: 6, status: { active: false } }, { id: 7, status: { active: true } }] });
    get.mockResolvedValueOnce({ status: { active: true }, summary: { totalOutstanding: 1200, totalOverdue: 100 }, delinquent: { pastDueDays: 3 } });
    get.mockResolvedValueOnce({ status: { active: true }, summary: { totalOutstanding: 300, totalOverdue: 20 }, delinquent: { pastDueDays: 7 } });
    expect(await adapter.resumenCliente('2')).toEqual({ saldoTotal: 1500, saldoVencido: 120, creditosActivos: 2, diasAtrasoMaximo: 7 });
    expect(get.mock.calls.map(c => c[0])).toEqual(['/v1/clients/2/accounts', '/v1/loans/5', '/v1/loans/7']);
  });
  it('no convierte un detalle sin saldo en una cartera vacía', async () => {
    const { get, adapter } = crear();
    get.mockResolvedValueOnce({ loanAccounts: [{ id: 5, status: { active: true } }] }).mockResolvedValueOnce({ status: { active: true } });
    await expect(adapter.resumenCliente('2')).rejects.toThrow('saldo válido');
  });
  it('propaga fallos de lectura en lugar de retornar un total parcial', async () => {
    const { get, adapter } = crear();
    get.mockResolvedValueOnce({ loanAccounts: [{ id: 5, status: { active: true } }] }).mockRejectedValueOnce(new Error('Fineract no disponible'));
    await expect(adapter.resumenCliente('2')).rejects.toThrow('Fineract no disponible');
  });
  it('descarta préstamos cerrados entre ambas consultas y admite cartera vacía', async () => {
    const { get, adapter } = crear();
    get.mockResolvedValueOnce({ loanAccounts: [{ id: 5, status: { active: true } }] }).mockResolvedValueOnce({ status: { active: false }, summary: { totalOutstanding: 0 } });
    expect((await adapter.resumenCliente('2')).creditosActivos).toBe(0);
    get.mockResolvedValueOnce({ loanAccounts: [] });
    expect((await adapter.resumenCliente('2')).saldoTotal).toBe(0);
  });
  it('comparte el presupuesto de espera entre las peticiones', async () => {
    const { get, adapter } = crear();
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockReturnValueOnce(1800);
      get.mockResolvedValueOnce({ loanAccounts: [{ id: 5, status: { active: true } }] }).mockResolvedValueOnce({ status: { active: true }, summary: { totalOutstanding: 1200 } });
      await adapter.resumenCliente('2', 1000);
      expect(get.mock.calls[0][1].timeoutMs).toBe(1000);
      expect(get.mock.calls[1][1].timeoutMs).toBe(200);
    } finally { now.mockRestore(); }
  });
});
