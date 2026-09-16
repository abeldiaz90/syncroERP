import { ErrorFineract } from './fineract-http.service';
import { FineractCarteraAdapter } from './fineract-cartera.adapter';

/**
 * El sentido externo -> ERP se apoya entero en poder listar las transacciones
 * de un credito distinguiendo cuales origino el ERP. Estas pruebas fijan ese
 * contrato y el criterio de «no existe», que estaba roto.
 */
describe('Transacciones de credito en Fineract', () => {
  function escenario() {
    const get = jest.fn();
    const adapter = new FineractCarteraAdapter(
      { get } as any,
      { timeoutFondoMs: 1000 } as any,
      {} as any,
      {} as any,
    );
    return { get, adapter };
  }

  it('traduce la transaccion y conserva la referencia del ERP', async () => {
    const s = escenario();
    s.get.mockResolvedValue({
      transactions: [
        {
          id: 41,
          externalId: 'SYNCRO-PAGO-1',
          type: { code: 'loanTransactionType.repayment' },
          amount: 600,
          date: [2026, 9, 14],
        },
      ],
    });

    const r = await s.adapter.transaccionesCredito('8');

    expect(r).toEqual([
      {
        idExterno: '41',
        referenciaErp: 'SYNCRO-PAGO-1',
        tipo: 'loanTransactionType.repayment',
        monto: 600,
        fecha: '2026-09-14',
        reversada: false,
      },
    ]);
    expect(s.get.mock.calls[0][0]).toContain('associations=transactions');
  });

  /*
   * El caso que justifica la prueba: una transaccion nacida fuera del ERP debe
   * quedar con referencia null. Si la cadena vacia se colara como referencia,
   * el conciliador la tomaria por propia y no la reflejaria nunca.
   */
  it.each([{ externalId: '' }, { externalId: null }, {}])(
    'marca como ajena la transaccion sin referencia: %j',
    async campo => {
      const s = escenario();
      s.get.mockResolvedValue({
        transactions: [{ id: 42, amount: 100, date: [2026, 9, 14], ...campo }],
      });

      const r = await s.adapter.transaccionesCredito('8');

      expect(r?.[0].referenciaErp).toBeNull();
    },
  );

  it('reconoce la reversa por cualquiera de los dos indicadores', async () => {
    const s = escenario();
    s.get.mockResolvedValue({
      transactions: [
        { id: 1, amount: 1, date: [2026, 9, 14], manuallyReversed: true },
        { id: 2, amount: 1, date: [2026, 9, 14], reversed: true },
        { id: 3, amount: 1, date: [2026, 9, 14] },
      ],
    });

    const r = await s.adapter.transaccionesCredito('8');

    expect(r?.map(t => t.reversada)).toEqual([true, true, false]);
  });

  it('descarta filas sin id en vez de emitir transacciones sin identidad', async () => {
    const s = escenario();
    s.get.mockResolvedValue({
      transactions: [{ amount: 1, date: [2026, 9, 14] }, { id: 7, amount: 1, date: [2026, 9, 14] }],
    });

    expect(await s.adapter.transaccionesCredito('8')).toHaveLength(1);
  });

  it('devuelve arreglo vacio, no null, cuando el credito existe y no tiene movimientos', async () => {
    const s = escenario();
    s.get.mockResolvedValue({});

    expect(await s.adapter.transaccionesCredito('8')).toEqual([]);
  });
});

/**
 * Regresion. El 404 se comprobaba en `estado` y `status`, campos que
 * ErrorFineract no tiene: la rama quedaba muerta y un credito borrado en el
 * core se reportaba como CONSULTA_FALLIDA —que se lee como «el enlace va
 * regular»— en vez de DESAPARECIDO, que es «alguien borro un prestamo que
 * aqui seguimos cobrando».
 */
describe('Credito que ya no existe en el externo', () => {
  function escenario() {
    const get = jest.fn();
    const adapter = new FineractCarteraAdapter(
      { get } as any,
      { timeoutFondoMs: 1000 } as any,
      {} as any,
      {} as any,
    );
    return { get, adapter };
  }

  it.each(['saldoCredito', 'transaccionesCredito'] as const)(
    '%s devuelve null ante un 404, no lanza',
    async metodo => {
      const s = escenario();
      s.get.mockRejectedValue(new ErrorFineract('no existe', 404, null, false));

      expect(await s.adapter[metodo]('8')).toBeNull();
    },
  );

  it.each([500, 503, null] as const)(
    'propaga el fallo de comunicacion %s en vez de inventar una desaparicion',
    async estado => {
      const s = escenario();
      s.get.mockRejectedValue(new ErrorFineract('caida', estado, null, true));

      await expect(s.adapter.saldoCredito('8')).rejects.toThrow();
      await expect(s.adapter.transaccionesCredito('8')).rejects.toThrow();
    },
  );
});
