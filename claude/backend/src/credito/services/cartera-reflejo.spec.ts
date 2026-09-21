import { ModoCartera } from '../../integracion/integracion.constants';
import { CarteraReflejoService } from './cartera-reflejo.service';

/**
 * Este servicio escribe cobranza real en el ERP a partir de lo que diga otro
 * sistema. Las pruebas fijan sobre todo lo que NO debe aplicar: equivocarse
 * hacia ese lado mete dinero inexistente en la tesoreria.
 */
describe('Reflejo de transacciones externas', () => {
  const CUENTA = 'cuenta-1';
  const base = {
    idExterno: '26',
    referenciaErp: null,
    tipo: 'loanTransactionType.repayment',
    monto: 600,
    fecha: '2026-09-14',
    reversada: false,
  };

  function escenario(transacciones: unknown[], opciones: { cuenta?: string | null } = {}) {
    const externa = {
      proveedor: 'fineract',
      configurado: () => true,
      transaccionesCredito: jest.fn().mockResolvedValue(transacciones),
    };
    const modos = { modoDe: jest.fn().mockResolvedValue(ModoCartera.SOMBRA) };
    const vinculos = {
      idExterno: jest.fn().mockResolvedValue('9'),
      porIdExterno: jest.fn().mockResolvedValue(null),
      vincular: jest.fn().mockResolvedValue(undefined),
    };
    const cobranza = {
      registrarPago: jest.fn().mockResolvedValue({ pago: { id: 'pago-1' } }),
    };
    const creditos = {
      find: jest.fn().mockResolvedValue([{ id: 'cred-1' }]),
    };
    const configuraciones = {
      findOne: jest.fn().mockResolvedValue({
        parametrosProveedor:
          opciones.cuenta === null ? {} : { cuentaCobranzaExternaId: opciones.cuenta ?? CUENTA },
      }),
    };
    const avisos = { marcarReflejado: jest.fn().mockResolvedValue(0) };
    const service = new CarteraReflejoService(
      externa as any,
      modos as any,
      vinculos as any,
      avisos as any,
      cobranza as any,
      creditos as any,
      configuraciones as any,
    );
    return { service, externa, modos, vinculos, cobranza, avisos };
  }

  it('aplica el pago externo por el servicio de cobranza y lo vincula', async () => {
    const s = escenario([base]);

    const r = await s.service.reflejarEmpresa('emp');

    expect(r).toMatchObject({ revisados: 1, aplicados: 1, omitidos: [] });
    const [dto, empresaId, usuarioId, opciones] = s.cobranza.registrarPago.mock.calls[0];
    expect(dto).toMatchObject({ creditoId: 'cred-1', montoPagado: 600, cuentaBancariaId: CUENTA });
    expect(empresaId).toBe('emp');
    expect(usuarioId).toBeUndefined();
    expect(s.vinculos.vincular).toHaveBeenCalledWith(
      expect.objectContaining({ entidadId: 'pago-1', idExterno: '26' }),
    );
  });

  /*
   * El eco. Sin esta opcion el pago se republicaria al externo y crearia alli
   * una segunda transaccion por el mismo dinero.
   */
  it('marca el pago como nacido fuera para que no se republique', async () => {
    const s = escenario([base]);

    await s.service.reflejarEmpresa('emp');

    expect(s.cobranza.registrarPago.mock.calls[0][3]).toEqual({ idTransaccionExterna: '26' });
  });

  it('deriva la clave de idempotencia del identificador externo', async () => {
    const s = escenario([base]);

    await s.service.reflejarEmpresa('emp');

    expect(s.cobranza.registrarPago.mock.calls[0][0].claveIdempotencia).toBe('ext:fineract:26');
  });

  /*
   * EL CASO QUE MAS IMPORTA. Una devolucion al cliente o una bonificacion bajan
   * el saldo sin que entre un peso. Aplicarlas como cobranza haria que el ERP
   * moviera tesoreria y cargara la caja por dinero que nunca recibio: el arqueo
   * saldria descuadrado y el asiento estaria mintiendo.
   */
  it.each([
    'loanTransactionType.merchantIssuedRefund',
    'loanTransactionType.payoutRefund',
    'loanTransactionType.goodwillCredit',
  ])('NO registra como cobranza lo que baja el saldo sin cobro: %s', async tipo => {
    const s = escenario([{ ...base, tipo }]);

    const r = await s.service.reflejarEmpresa('emp');

    expect(s.cobranza.registrarPago).not.toHaveBeenCalled();
    expect(r.aplicados).toBe(0);
    expect(r.omitidos[0].motivo).toContain('sin que entre dinero');
  });

  it('no inventa la caja que recibio un cobro registrado fuera', async () => {
    const s = escenario([base], { cuenta: null });

    const r = await s.service.reflejarEmpresa('emp');

    expect(s.cobranza.registrarPago).not.toHaveBeenCalled();
    expect(r.omitidos[0].motivo).toContain('cuentaCobranzaExternaId');
  });

  it('no toca las transacciones que origino el ERP', async () => {
    const s = escenario([{ ...base, referenciaErp: 'syncro:pago_cobranza:abc' }]);

    expect(await s.service.reflejarEmpresa('emp')).toMatchObject({ revisados: 0, aplicados: 0 });
    expect(s.cobranza.registrarPago).not.toHaveBeenCalled();
  });

  it('no reaplica la que ya tiene vinculo', async () => {
    const s = escenario([base]);
    s.vinculos.porIdExterno.mockResolvedValue({ id: 'v1' });

    expect(await s.service.reflejarEmpresa('emp')).toMatchObject({ revisados: 0, aplicados: 0 });
    expect(s.cobranza.registrarPago).not.toHaveBeenCalled();
  });

  it('ignora las reversadas y los movimientos propios del core', async () => {
    const s = escenario([
      { ...base, reversada: true },
      { ...base, idExterno: '27', tipo: 'loanTransactionType.disbursement' },
      { ...base, idExterno: '28', tipo: 'loanTransactionType.accrual' },
    ]);

    expect(await s.service.reflejarEmpresa('emp')).toMatchObject({ aplicados: 0, revisados: 0 });
  });

  /*
   * Aislamiento: una empresa que solo tiene ERP no debe ni consultarse.
   * Preguntar ya es mandar sus identificadores a un sistema que no contrato.
   */
  it('ni consulta al externo cuando la empresa esta en modo apagado', async () => {
    const s = escenario([base]);
    s.modos.modoDe.mockResolvedValue(ModoCartera.APAGADO);

    expect(await s.service.reflejarEmpresa('emp')).toMatchObject({ revisados: 0, aplicados: 0 });
    expect(s.externa.transaccionesCredito).not.toHaveBeenCalled();
  });

  /*
   * Lo que el ERP rechaza no se fuerza: un pago que excede el saldo es una
   * divergencia de fondo, y saltarse la validacion para que «cuadre» es como
   * se corrompe una cartera.
   */
  it('recoge el rechazo del ERP como omision y sigue con lo demas', async () => {
    const s = escenario([base]);
    s.cobranza.registrarPago.mockRejectedValue(new Error('El pago excede el saldo pendiente'));

    const r = await s.service.reflejarEmpresa('emp');

    expect(r).toMatchObject({ aplicados: 0 });
    expect(r.omitidos[0].motivo).toContain('excede el saldo');
    expect(s.vinculos.vincular).not.toHaveBeenCalled();
  });

  it('no trata una caida de enlace como ausencia de movimientos', async () => {
    const s = escenario([base]);
    s.externa.transaccionesCredito.mockRejectedValue(new Error('enlace caido'));

    const r = await s.service.reflejarEmpresa('emp');

    expect(r.aplicados).toBe(0);
    expect(r.omitidos[0].motivo).toContain('enlace caido');
  });
});
