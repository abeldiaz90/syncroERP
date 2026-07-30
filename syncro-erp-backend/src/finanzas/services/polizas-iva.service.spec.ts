import { PolizasService } from './polizas.service';

describe('PolizasService — IVA por rol contable', () => {
  it('resta las reversas al IVA trasladado y acreditable', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        {
          numeroCuenta: 'IVA-V',
          nombre: 'IVA ventas',
          rolSistema: 'IVA_TRASLADADO_COBRADO',
          cargo: 16,
          abono: 160,
        },
        {
          numeroCuenta: 'IVA-C',
          nombre: 'IVA compras',
          rolSistema: 'IVA_ACREDITABLE_PAGADO',
          cargo: 80,
          abono: 8,
        },
      ]),
    };
    const service = new PolizasService(dataSource as any);

    const resultado = await service.obtenerDeclaracionIVA(
      'empresa-1',
      '2026-06-01',
      '2026-06-30',
    );

    expect(resultado.ivaTrasladadoTotal).toBe(144);
    expect(resultado.ivaAcreditableTotal).toBe(72);
    expect(resultado.ivaAPagar).toBe(72);
    expect(resultado.saldoAFavor).toBe(0);
  });
});
