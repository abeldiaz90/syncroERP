import {
  AmortizacionCuota,
  EstadoCuota,
} from './entities/amortizacion-cuota.entity';
import {
  proporcionDeCapital,
  reducirCuota,
  saldoReducibleDe,
} from './utils/reducir-cuota.util';

/**
 * ============================================================================
 * UN INTERÉS NEGATIVO NO EXISTE
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * El reparto de un pago decide cuánto va a capital y cuánto a ingresos por
 * intereses con la proporción que trae la cuota:
 *
 *     proporcionCapital = montoCapital / montoCuota
 *     capital = aplicar × proporcionCapital
 *     interes = aplicar − capital
 *
 * El ajuste por devolución registrada en el sistema externo bajaba `montoCuota`
 * y **dejaba `montoCapital` donde estaba**. A partir de ahí esa proporción es
 * mayor que uno:
 *
 *     cuota de 1,000 = 900 capital + 100 interés
 *     ajuste externo de 300 → montoCuota 700, montoCapital sigue en 900
 *     proporción = 900 / 700 = 1.2857
 *     pago de 700 → capital 900, interés −200
 *
 * Y de ahí salen tres cosas, ninguna visible al hacerlas:
 *
 *   · el crédito reporta **más capital cobrado que dinero recibido**;
 *   · la póliza de cobranza lleva un abono negativo a ingresos por intereses,
 *     así que **no se genera** y el pago se queda sin asiento;
 *   · el saldo del crédito y la suma de sus cuotas dejan de coincidir.
 *
 * LA REGLA NO SE INVENTÓ AQUÍ
 *
 * «Primero el capital, después el interés» ya estaba escrita y funcionando en
 * `DevolucionesVentasService.reducirCuotas`. Lo que faltaba es que la usara el
 * camino de al lado. Es la misma forma de defecto que este proyecto ya encontró
 * varias veces, así que no se copió la lógica: se sacó a `reducirCuota` y los
 * dos caminos la llaman.
 *
 * Y se añade una red para los créditos que YA pasaron por el defecto: la
 * proporción se acota a uno al repartir un pago. No es la corrección —ésa es
 * que nadie rompa el invariante— pero sin ella esos créditos seguirían dando
 * intereses negativos para siempre.
 * ============================================================================
 */

const cuotaDe = (extra: Partial<AmortizacionCuota> = {}) =>
  ({
    montoCapital: 900,
    montoInteres: 100,
    montoCuota: 1000,
    saldoRestante: 1000,
    montoPagado: 0,
    estado: EstadoCuota.PENDIENTE,
    fechaPago: null as unknown as Date,
    ...extra,
  }) as AmortizacionCuota;

/** El invariante del que depende todo el reparto de pagos. */
const esperarInvariante = (cuota: AmortizacionCuota) =>
  expect(
    Math.round((Number(cuota.montoCapital) + Number(cuota.montoInteres)) * 100),
  ).toBe(Math.round(Number(cuota.montoCuota) * 100));

describe('reducir una cuota reparte la baja entre capital e interés', () => {
  it('el caso que producía el interés negativo', () => {
    const cuota = cuotaDe();
    reducirCuota(cuota, 300);

    expect(cuota.montoCuota).toBe(700);
    /* Capital primero: los 300 salen todos del capital, que tenía 900. */
    expect(cuota.montoCapital).toBe(600);
    expect(cuota.montoInteres).toBe(100);
    esperarInvariante(cuota);
  });

  it('y después del ajuste, el pago ya no da interés negativo', () => {
    /*
     * La comprobación que cierra el caso: se reproduce el cálculo del reparto
     * sobre la cuota ya reducida. Antes daba −200.
     */
    const cuota = cuotaDe();
    reducirCuota(cuota, 300);

    const aplicar = Number(cuota.montoCuota);
    const capital = Math.round(aplicar * proporcionDeCapital(cuota) * 100) / 100;
    const interes = Math.round((aplicar - capital) * 100) / 100;

    expect(capital).toBe(600);
    expect(interes).toBe(100);
    expect(interes).toBeGreaterThanOrEqual(0);
  });

  it('cuando la baja supera al capital, el resto sale del interés', () => {
    const cuota = cuotaDe();
    reducirCuota(cuota, 950);

    expect(cuota.montoCuota).toBe(50);
    expect(cuota.montoCapital).toBe(0);
    expect(cuota.montoInteres).toBe(50);
    esperarInvariante(cuota);
  });

  it('nunca deja el capital por encima del total de la cuota', () => {
    /*
     * El tope que protege del céntimo de redondeo. Sin él, una cuota con
     * decimales podía acabar con el capital un céntimo por encima y devolver el
     * interés negativo por la puerta de atrás.
     */
    for (const importe of [0.01, 1, 33.33, 333.33, 666.67, 999.99]) {
      const cuota = cuotaDe({
        montoCapital: 899.99,
        montoInteres: 100.01,
        montoCuota: 1000,
      });
      reducirCuota(cuota, importe);
      expect(Number(cuota.montoCapital)).toBeLessThanOrEqual(
        Number(cuota.montoCuota),
      );
      expect(Number(cuota.montoInteres)).toBeGreaterThanOrEqual(0);
      esperarInvariante(cuota);
    }
  });

  it('no reduce más de lo que queda por cobrar de la cuota', () => {
    const cuota = cuotaDe({ montoPagado: 700 });
    const { reducido } = reducirCuota(cuota, 1000);

    expect(reducido).toBe(300);
    expect(cuota.montoCuota).toBe(700);
  });

  it('una cuota ya cubierta no ofrece nada que reducir', () => {
    const cuota = cuotaDe({ montoPagado: 1000 });
    const { reducido } = reducirCuota(cuota, 500);

    expect(reducido).toBe(0);
    expect(cuota.montoCuota).toBe(1000);
  });

  it('una cuota sobrepagada tampoco, y no devuelve un saldo negativo', () => {
    /*
     * Sin el `max(0)`, un saldo negativo haría que la reducción se «gastara» en
     * una cuota que no la admite y aumentara la siguiente.
     */
    const cuota = cuotaDe({ montoPagado: 1200 });
    expect(saldoReducibleDe(cuota)).toBe(0);
    expect(reducirCuota(cuota, 500).reducido).toBe(0);
  });

  it('baja el saldo restante, que es lo que lee la pantalla del crédito', () => {
    const cuota = cuotaDe();
    reducirCuota(cuota, 300);
    expect(cuota.saldoRestante).toBe(700);
  });

  it('marca PAGADA la cuota que queda cubierta por lo ya pagado', () => {
    const cuota = cuotaDe({ montoPagado: 700 });
    reducirCuota(cuota, 300);

    expect(cuota.montoCuota).toBe(700);
    expect(cuota.estado).toBe(EstadoCuota.PAGADA);
    expect(cuota.fechaPago).toBeTruthy();
  });
});

describe('reducir una cuota que YA venía dañada', () => {
  /*
   * El caso que dos mutantes deliberados sacaron a la luz, y que no es
   * hipotético: un crédito que sufrió el defecto y al que después se le aplica
   * otra devolución. La cuota guardada trae el capital por encima del total.
   *
   *     montoCuota 700, montoCapital 900, se reducen 100
   *
   * Sin el tope del capital contra el nuevo total, el capital queda en 800
   * sobre una cuota de 600 y el interés derivado sale en −200: el mismo defecto
   * que esta función existe para cerrar, entrando por la puerta de atrás.
   */
  it('la deja sana en vez de empeorarla', () => {
    const dañada = cuotaDe({ montoCuota: 700, montoCapital: 900, montoInteres: 100 });
    reducirCuota(dañada, 100);

    expect(dañada.montoCuota).toBe(600);
    expect(Number(dañada.montoCapital)).toBeLessThanOrEqual(600);
    expect(Number(dañada.montoInteres)).toBeGreaterThanOrEqual(0);
    esperarInvariante(dañada);
  });

  it('y el pago siguiente ya no puede dar interés negativo', () => {
    const dañada = cuotaDe({ montoCuota: 700, montoCapital: 900, montoInteres: 100 });
    reducirCuota(dañada, 100);

    const aplicar = Number(dañada.montoCuota);
    const capital = aplicar * proporcionDeCapital(dañada);
    expect(aplicar - capital).toBeGreaterThanOrEqual(0);
  });
});

describe('la red para los créditos que ya pasaron por el defecto', () => {
  it('acota la proporción a uno en una cuota ya dañada', () => {
    /*
     * Una cuota guardada con el capital por encima del total: 900 sobre 700.
     * Sin el tope, el siguiente pago volvería a dar interés negativo aunque el
     * defecto ya esté corregido, porque el dato malo sigue en la base.
     */
    const dañada = cuotaDe({ montoCuota: 700, montoCapital: 900 });
    expect(proporcionDeCapital(dañada)).toBe(1);

    const aplicar = 700;
    const capital = aplicar * proporcionDeCapital(dañada);
    expect(aplicar - capital).toBe(0);
  });

  it('en una cuota sana no cambia nada', () => {
    expect(proporcionDeCapital(cuotaDe())).toBeCloseTo(0.9, 10);
  });

  it('una cuota en cero no divide entre cero', () => {
    expect(proporcionDeCapital(cuotaDe({ montoCuota: 0 }))).toBe(1);
  });
});

describe('los dos caminos que reducen cuotas llaman a la misma regla', () => {
  /*
   * ESTRUCTURAL, Y CON MOTIVO. El defecto no era que la regla no existiera: era
   * que existía en un camino y no en el de al lado. Si alguien vuelve a escribir
   * la aritmética a mano en cualquiera de los dos, vuelve el mismo defecto por
   * la misma puerta, y ninguna prueba de comportamiento de la utilidad lo vería.
   */
  const leer = (ruta: string[]) =>
    require('fs').readFileSync(
      require('path').join(__dirname, '..', ...ruta),
      'utf8',
    ) as string;

  it('el ajuste por devolución externa', () => {
    const fuente = leer(['credito', 'services', 'cobranza.service.ts']);
    expect(fuente).toContain('reducirCuota(cuota, porReducir)');
    expect(fuente).not.toMatch(
      /cuota\.montoCuota = this\.redondear\(Number\(cuota\.montoCuota\) - quitar\)/,
    );
  });

  it('la devolución de venta, que es de donde salió la regla', () => {
    const fuente = leer(['ventas', 'services', 'devoluciones-ventas.service.ts']);
    expect(fuente).toContain('reducirCuota(cuota, pendiente)');
    expect(fuente).not.toMatch(/const capitalReducido = Math\.min\(/);
  });

  it('y el reparto del pago usa la proporción acotada', () => {
    const fuente = leer(['credito', 'services', 'cobranza.service.ts']);
    expect(fuente).toContain('proporcionDeCapital(cuota)');
    expect(fuente).not.toMatch(
      /Number\(cuota\.montoCapital\) \/ Number\(cuota\.montoCuota\)/,
    );
  });
});
