import { CreditosService } from './creditos.service';
import { TipoCredito } from '../entities/credito-cliente.entity';

describe('CreditosService: plazos autorizados', () => {
  const service = new CreditosService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );

  it.each([
    [TipoCredito.CREDITO_30D, '2026-01-31'],
    [TipoCredito.CREDITO_60D, '2026-03-02'],
    [TipoCredito.CREDITO_90D, '2026-04-01'],
  ])('respeta los días reales de %s', (tipo, esperada) => {
    const [cuota] = service.calcularAmortizacion({
      capital: 1000,
      numeroCuotas: 1,
      tasaInteresMensual: 0,
      sinInteres: true,
      fechaInicio: '2026-01-01T12:00:00.000Z',
      tipoCredito: tipo,
    });
    expect(cuota.fechaVencimiento.toISOString().slice(0, 10)).toBe(esperada);
  });
});
