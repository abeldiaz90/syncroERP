import { CreditosService } from './creditos.service';
import { TipoCredito } from '../entities/credito-cliente.entity';
import { UnidadPlazo } from '../entities/producto-credito.entity';
import { diaCalendario } from '../../common/utils/fecha-calendario.util';

describe('CreditosService: plazos autorizados', () => {
  const service = new CreditosService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    // calcularAmortizacion es una función pura: no toca la cartera.
    undefined as any,
    // Ni la política de vencimientos: sin ajustador, las fechas son las crudas.
    undefined as any,
    // Ni el catálogo: sin `productoCreditoId` no se resuelve ningún producto.
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

  /*
   * Con producto, el plazo lo dicta la fila del catálogo. Es la distinción que
   * el adaptador se comió durante semanas: mandaba todo en meses y los créditos
   * a 30, 60 y 90 días vencían el mismo día en el registro externo mientras
   * todos los importes cuadraban.
   */
  it.each([
    [UnidadPlazo.DIAS, 30, ['2026-01-31']],
    [UnidadPlazo.DIAS, 45, ['2026-02-15']],
    [UnidadPlazo.MESES, 1, ['2026-02-01', '2026-03-01', '2026-04-01']],
    [UnidadPlazo.MESES, 2, ['2026-03-01', '2026-05-01', '2026-07-01']],
  ])('toma el plazo del producto: cada %s %s', (unidad, cada, esperadas) => {
    const tabla = service.calcularAmortizacion({
      capital: 3000,
      numeroCuotas: (esperadas as string[]).length,
      tasaInteresMensual: 0,
      sinInteres: true,
      fechaInicio: '2026-01-01',
      unidadPlazo: unidad as UnidadPlazo,
      cadaCuantos: cada as number,
    });
    expect(tabla.map((c) => diaCalendario(c.fechaVencimiento))).toEqual(
      esperadas,
    );
  });

  it('no corre la primera cuota un día por la zona horaria', () => {
    const [cuota] = service.calcularAmortizacion({
      capital: 1000,
      numeroCuotas: 1,
      tasaInteresMensual: 0,
      sinInteres: true,
      fechaInicio: '2026-09-08',
      unidadPlazo: UnidadPlazo.DIAS,
      cadaCuantos: 30,
    });
    expect(diaCalendario(cuota.fechaVencimiento)).toBe('2026-10-08');
  });
});
