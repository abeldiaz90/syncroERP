import { FineractContabilidadAdapter } from './fineract-contabilidad.adapter';

describe('Consulta completa de asiento Fineract', () => {
  const linea = { id: 1, transactionId: 't', officeId: 1, glAccountId: 2, amount: 600, entryType: { id: 2 }, reversed: true, referenceNumber: 'SYNCRO-IN-1', currency: { code: 'MXN' } };
  function escenario() {
    const get = jest.fn();
    return { get, adapter: new FineractContabilidadAdapter({ get } as any, {} as any, {} as any, {} as any) };
  }
  it('recorre todas las páginas y traduce el indicador de reversa', async () => {
    const s = escenario(); s.get.mockResolvedValueOnce({ totalFilteredRecords: 2, pageItems: [linea] }).mockResolvedValueOnce({ totalFilteredRecords: 2, pageItems: [{ ...linea, id: 2, entryType: { id: 1 }, glAccountId: 4 }] });
    const r = await s.adapter.consultarAsiento('t', '1'); expect(r?.reversado).toBe(true); expect(r?.movimientos).toHaveLength(2);
    expect(s.get.mock.calls[1][1].params.offset).toBe(1);
  });
  it.each([{ ...linea, officeId: 2 }, { ...linea, transactionId: 'otro' }, { ...linea, entryType: { id: 9 } }])('rechaza alcance o partida inválidos: %j', async m => {
    const s = escenario(); s.get.mockResolvedValue({ totalFilteredRecords: 1, pageItems: [m] });
    await expect(s.adapter.consultarAsiento('t', '1')).rejects.toThrow();
  });
  it('rechaza páginas repetidas en vez de devolver un asiento parcial', async () => {
    const s = escenario(); s.get.mockResolvedValue({ totalFilteredRecords: 2, pageItems: [linea] });
    await expect(s.adapter.consultarAsiento('t', '1')).rejects.toThrow();
  });
  it('distingue ausencia de respuesta incompleta', async () => {
    const s = escenario(); s.get.mockResolvedValueOnce({ totalFilteredRecords: 0, pageItems: [] }).mockResolvedValueOnce({ pageItems: [] });
    expect(await s.adapter.consultarAsiento('t', '1')).toBeNull(); await expect(s.adapter.consultarAsiento('t', '1')).rejects.toThrow();
  });
});
