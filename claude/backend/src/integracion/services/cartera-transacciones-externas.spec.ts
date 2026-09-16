import { CarteraConciliacionService } from './cartera-conciliacion.service';

/**
 * El discriminador de esta pieza es lo unico que separa «alguien cobro en el
 * core y el ERP no se ha enterado» de «el core genero un devengo suyo». Si se
 * equivoca hacia un lado, se pierde dinero de vista; hacia el otro, la
 * conciliacion se llena de ruido y deja de leerse. Por eso se fija aqui.
 */
describe('Transacciones nacidas fuera del ERP', () => {
  function escenario(transacciones: unknown, yaReflejada: unknown = null) {
    const externa = {
      transaccionesCredito: jest.fn().mockResolvedValue(transacciones),
    };
    const vinculos = {
      porIdExterno: jest.fn().mockResolvedValue(yaReflejada),
    };
    const service = new CarteraConciliacionService(
      {} as any,
      vinculos as any,
      externa as any,
      { manager: { query: jest.fn().mockResolvedValue([]) } } as any,
      {} as any,
    );
    const registrar = jest.fn().mockResolvedValue(undefined);
    (service as any).registrar = registrar;
    // El cuarto argumento es el registro de lo vigente en esta corrida, que
    // la conciliacion usa despues para cerrar sola lo que ya no encuentra.
    const revisar = () =>
      (service as any).revisarTransacciones(
        'emp',
        new Date(),
        new Set<string>(),
        'cred',
        '8',
      );
    return { externa, vinculos, registrar, revisar };
  }

  const base = { idExterno: '1', tipo: 'loanTransactionType.repayment', monto: 600, fecha: '2026-09-14', reversada: false };

  it('denuncia el pago registrado directamente en el externo', async () => {
    const s = escenario([{ ...base, referenciaErp: null }]);

    expect(await s.revisar()).toBe(1);
    expect(s.registrar.mock.calls[0][3]).toMatchObject({
      concepto: 'TRANSACCION_EXTERNA',
      valorExterno: 600,
    });
  });

  it('calla ante las transacciones que origino el ERP', async () => {
    const s = escenario([{ ...base, referenciaErp: 'syncro:pago_cobranza:abc' }]);

    expect(await s.revisar()).toBe(0);
    expect(s.registrar).not.toHaveBeenCalled();
  });

  /*
   * El caso que motivo todo esto: el ERP aplico el pago y alguien lo deshizo
   * en el core. Los totales del cliente dejan de cuadrar sin que nadie haya
   * tocado el ERP, asi que callarlo seria lo peor que podria hacer.
   */
  it('denuncia la reversa externa de una transaccion propia', async () => {
    const s = escenario([{ ...base, referenciaErp: 'syncro:pago_cobranza:abc', reversada: true }]);

    expect(await s.revisar()).toBe(1);
    expect(s.registrar.mock.calls[0][3]).toMatchObject({
      concepto: 'TRANSACCION_REVERSADA_FUERA',
      valorErp: 600,
    });
  });

  it('ignora lo que nacio fuera y ya se deshizo alli: neta cero', async () => {
    const s = escenario([{ ...base, referenciaErp: null, reversada: true }]);

    expect(await s.revisar()).toBe(0);
  });

  /*
   * El desembolso y los devengos los genera el propio core y no llevan
   * referencia del ERP. Si no estuvieran enumerados como suyos, el desembolso
   * de CADA credito saldria como hallazgo y enterraria a los verdaderos.
   */
  it.each([
    'loanTransactionType.disbursement',
    'loanTransactionType.accrual',
    'loanTransactionType.incomePosting',
  ])('calla ante la transaccion propia del core: %s', async tipo => {
    const s = escenario([{ ...base, tipo, referenciaErp: null }]);

    expect(await s.revisar()).toBe(0);
    expect(s.registrar).not.toHaveBeenCalled();
  });

  /*
   * Pero lo que no conocemos NO se calla: puede ser dinero real, y decidir que
   * no lo es sin haberlo mirado es justo la clase de silencio que descuadra
   * una cartera.
   */
  it.each(['loanTransactionType.writeOff', 'loanTransactionType.chargeoff'])(
    'denuncia el tipo que no sabe clasificar: %s',
    async tipo => {
      const s = escenario([{ ...base, tipo, referenciaErp: null }]);

      expect(await s.revisar()).toBe(1);
      expect(s.registrar.mock.calls[0][3]).toMatchObject({ concepto: 'TIPO_EXTERNO_DESCONOCIDO' });
    },
  );

  it('reconoce los tipos reflejables sin importar mayusculas ni prefijo', async () => {
    const s = escenario([
      { ...base, tipo: 'loanTransactionType.merchantIssuedRefund', referenciaErp: null },
      { ...base, idExterno: '2', tipo: 'REPAYMENT', referenciaErp: null },
    ]);

    expect(await s.revisar()).toBe(2);
    for (const llamada of s.registrar.mock.calls) {
      expect(llamada[3]).toMatchObject({ concepto: 'TRANSACCION_EXTERNA' });
    }
  });

  /*
   * Ya reflejada por el aplicador. Su identificador en el core no se puede
   * cambiar, asi que sin mirar el vinculo se denunciaria para siempre.
   */
  it('calla ante la transaccion que el aplicador ya reflejo', async () => {
    const s = escenario([{ ...base, referenciaErp: null }], { id: 'v1' });

    expect(await s.revisar()).toBe(0);
    expect(s.registrar).not.toHaveBeenCalled();
  });

  it('no repite DESAPARECIDO cuando el credito ya no existe allá', async () => {
    const s = escenario(null);

    expect(await s.revisar()).toBe(0);
    expect(s.registrar).not.toHaveBeenCalled();
  });

  /*
   * Una caida de red no puede leerse como «no hubo movimientos externos»: eso
   * convertiria cada corte de enlace en un visto bueno silencioso.
   */
  it('registra la consulta fallida en vez de suponer que no hay nada', async () => {
    const s = escenario(null);
    s.externa.transaccionesCredito.mockRejectedValue(new Error('enlace caido'));

    expect(await s.revisar()).toBe(1);
    expect(s.registrar.mock.calls[0][3]).toMatchObject({ concepto: 'CONSULTA_FALLIDA' });
  });
});
