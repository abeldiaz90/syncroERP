/**
 * ============================================================================
 * La amortización suma el capital exacto, y el pago se reparte
 * ----------------------------------------------------------------------------
 * HALLAZGO 55 DEL BARRIDO.
 *
 * Nada afirmaba que la tabla de amortización sumara el capital financiado.
 * `creditos-politica.spec.ts` sí llama al método real, pero todas sus
 * expectativas son sobre FECHAS de vencimiento: ninguna sobre importes. Y el
 * reparto capital/interés de `registrarPago` estaba mockeado en una prueba y
 * reimplementado dentro de otra.
 *
 * Un centavo que se pierde en la tabla no lo caza nadie: el crédito queda con
 * un saldo que no se puede liquidar —el hallazgo 40, que ya pagamos— o con
 * capital de más que el cliente paga sin deberlo. Y como la última cuota
 * absorbe el redondeo, el error aparece al final, meses después del alta.
 * ============================================================================
 */
import { CreditosService } from './services/creditos.service';
import { proporcionDeCapital } from './utils/reducir-cuota.util';

const servicio: any = Object.create(CreditosService.prototype);
const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

const dto = (extra: Record<string, unknown> = {}) => ({
  capital: 10000,
  numeroCuotas: 12,
  tasaInteresMensual: 0,
  sinInteres: true,
  fechaInicio: '2026-10-01',
  ...extra,
});

describe('Amortización sin interés', () => {
  it('las cuotas suman EXACTAMENTE el capital financiado', () => {
    const tabla = servicio.calcularAmortizacion(dto());
    expect(tabla).toHaveLength(12);
    expect(suma(tabla.map((c: any) => c.montoCapital))).toBe(10000);
  });

  it('la última cuota absorbe el redondeo, y es la única distinta', () => {
    /* 10,000 / 12 = 833.3333 → 833.33; 11 × 833.33 = 9,166.63; última 833.37 */
    const tabla = servicio.calcularAmortizacion(dto());
    expect(tabla.slice(0, 11).map((c: any) => c.montoCapital)).toEqual(
      Array(11).fill(833.33),
    );
    expect(tabla[11].montoCapital).toBe(833.37);
  });

  it('un capital que no divide tampoco pierde un centavo', () => {
    const tabla = servicio.calcularAmortizacion(
      dto({ capital: 1000, numeroCuotas: 3 }),
    );
    expect(tabla.map((c: any) => c.montoCapital)).toEqual([333.33, 333.33, 333.34]);
    expect(suma(tabla.map((c: any) => c.montoCapital))).toBe(1000);
  });

  it('sin interés, la cuota ES el capital y el saldo termina en cero', () => {
    const tabla = servicio.calcularAmortizacion(dto());
    for (const c of tabla) {
      expect(c.montoInteres).toBe(0);
      expect(c.montoCuota).toBe(c.montoCapital);
    }
    expect(tabla[11].saldoRestante).toBe(0);
  });
});

describe('Amortización francesa', () => {
  const frances = () =>
    servicio.calcularAmortizacion(
      dto({ sinInteres: false, tasaInteresMensual: 2 }),
    );

  it('el capital de las doce cuotas suma el financiado, al centavo', () => {
    expect(suma(frances().map((c: any) => c.montoCapital))).toBe(10000);
  });

  it('el interés de la primera cuota es el saldo por la tasa', () => {
    /* 10,000 × 2% = 200 */
    expect(frances()[0].montoInteres).toBe(200);
  });

  it('el interés baja cuota a cuota y el capital sube', () => {
    const tabla = frances();
    for (let i = 1; i < tabla.length; i++) {
      expect(tabla[i].montoInteres).toBeLessThan(tabla[i - 1].montoInteres);
      expect(tabla[i].montoCapital).toBeGreaterThan(tabla[i - 1].montoCapital);
    }
  });

  it('cada cuota cuadra: capital + interés = cuota', () => {
    for (const c of frances()) {
      expect(Math.round((c.montoCapital + c.montoInteres) * 100) / 100).toBe(
        c.montoCuota,
      );
    }
  });

  it('el saldo llega a cero y no a un residuo', () => {
    const tabla = frances();
    expect(tabla[tabla.length - 1].saldoRestante).toBe(0);
  });

  it('once cuotas iguales y la última ajustada: el redondeo no se reparte', () => {
    /*
     * El método francés da cuota fija; si alguien "repartiera" el residuo entre
     * todas, el cliente vería doce importes distintos en su tabla de pagos y
     * ninguno coincidiría con el contrato.
     */
    const tabla = frances();
    const cuotas = tabla.slice(0, 11).map((c: any) => c.montoCuota);
    expect(new Set(cuotas).size).toBe(1);
  });
});

describe('El reparto de un abono entre capital e interés', () => {
  it('la proporción sale de la cuota, no del saldo del crédito', () => {
    expect(proporcionDeCapital({ montoCapital: 800, montoCuota: 1000 } as any)).toBe(0.8);
  });

  it('nunca pasa de uno, aunque el dato venga roto', () => {
    /*
     * Es la red del hallazgo 12: los créditos que pasaron por el defecto tienen
     * cuotas con el capital por encima del total, y sin este tope el reparto
     * daba INTERÉS NEGATIVO y una póliza que no nacía nunca.
     */
    expect(proporcionDeCapital({ montoCapital: 1500, montoCuota: 1000 } as any)).toBe(1);
  });

  it('una cuota de importe cero se trata como capital puro', () => {
    expect(proporcionDeCapital({ montoCapital: 0, montoCuota: 0 } as any)).toBe(1);
  });

  it('el abono repartido con esa proporción nunca inventa interés', () => {
    /*
     * La regla del servicio es `capital = aplicar × proporción` e
     * `interes = aplicar − capital`. Con la proporción acotada a uno, el
     * interés no puede salir negativo para ningún abono.
     */
    const casos = [
      { montoCapital: 800, montoCuota: 1000, aplicar: 1000 },
      { montoCapital: 800, montoCuota: 1000, aplicar: 1 },
      { montoCapital: 1500, montoCuota: 1000, aplicar: 1000 },
      { montoCapital: 0, montoCuota: 0, aplicar: 500 },
    ];
    for (const caso of casos) {
      const proporcion = proporcionDeCapital(caso as any);
      const capital = Math.round(caso.aplicar * proporcion * 100) / 100;
      const interes = Math.round((caso.aplicar - capital) * 100) / 100;
      expect(interes).toBeGreaterThanOrEqual(0);
      expect(Math.round((capital + interes) * 100) / 100).toBe(caso.aplicar);
    }
  });
});
