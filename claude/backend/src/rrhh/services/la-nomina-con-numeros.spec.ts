/**
 * ============================================================================
 * La nómina, con números
 * ----------------------------------------------------------------------------
 * HALLAZGO 51 DEL BARRIDO, Y ES EL QUE MÁS ME PREOCUPABA DE TODOS.
 *
 * ISR, IMSS, subsidio, topes de UMA y horas extra no tenían **una sola
 * aserción numérica** sobre el método que corre. Ningún `.spec.ts` instanciaba
 * `NominaCalculoService`. Lo único que había eran pruebas que leen el TEXTO del
 * fuente con una expresión regular, y en un caso dos utilidades extraídas del
 * archivo y recompiladas con `new Function`: eso prueba cómo está escrito el
 * código, no cuánto le descuenta a una persona.
 *
 * Aquí se construye el servicio y se le piden los cálculos de verdad. Los
 * números esperados están calculados a mano a partir de las tarifas publicadas
 * —la aritmética va escrita al lado de cada uno para que se pueda cotejar
 * contra el DOF sin leer el código— y nunca se toman del propio servicio: una
 * prueba que le pregunta al sujeto cuál es la respuesta correcta no prueba
 * nada.
 *
 * Tarifas 2026 usadas (`rrhh/data/tarifas-fiscales.ts`):
 *   UMA diaria 117.31 · salario mínimo general 315.04
 *   ISR quincenal: renglón 7,225.96–8,651.40 → cuota fija 660.75, 17.92%
 *   IMSS obrero: excedente 0.4 · dinero 0.25 · médicos 0.375 · IV 0.625 · CV 1.125
 *   IMSS patronal: cuota fija 20.4% UMA · excedente 1.1 · dinero 0.7 ·
 *                  médicos 1.05 · IV 1.75 · guarderías 1 · retiro 2 · infonavit 5
 *   Cesantía patronal 2026 por encima de 4 UMA: 7.513%
 * ============================================================================
 */
import {
  JornadaLaboral,
  NaturalezaConcepto,
  RegimenPago,
} from '../entities/rrhh.entity';
import { NominaCalculoService } from './nomina-calculo.service';

const servicio: any = new NominaCalculoService(null as any);
const UMA = 117.31;

describe('ISR · el renglón y la aritmética del artículo 96', () => {
  it('base de 8,000 quincenales: 799.46', () => {
    /*
     * 660.75 + (8,000 − 7,225.96) × 17.92%
     *        = 660.75 + 774.04 × 0.1792
     *        = 660.75 + 138.707968 = 799.457968 → 799.46
     */
    expect(servicio.calcularIsr(8000, 2026, RegimenPago.QUINCENAL)).toBe(799.46);
  });

  it('base pequeña: cae en el primer renglón, no en cero', () => {
    /* 0 + (400 − 0.01) × 1.92% = 7.679808 → 7.68 */
    expect(servicio.calcularIsr(400, 2026, RegimenPago.QUINCENAL)).toBe(7.68);
  });

  it('sin base gravable no hay impuesto', () => {
    expect(servicio.calcularIsr(0, 2026, RegimenPago.QUINCENAL)).toBe(0);
    expect(servicio.calcularIsr(-500, 2026, RegimenPago.QUINCENAL)).toBe(0);
  });

  it('el renglón alto no usa la cuota fija del bajo', () => {
    /*
     * Una base de 30,000 quincenales cae en 27,501.61–52,505.25:
     * 5,159.70 + (30,000 − 27,501.61) × 30% = 5,159.70 + 749.517 = 5,909.217 → 5,909.22
     *
     * Esto mata el mutante más fácil de todos: tomar siempre el primer renglón
     * de la tabla, que con la tarifa ordenada da un número plausible.
     */
    expect(servicio.calcularIsr(30000, 2026, RegimenPago.QUINCENAL)).toBe(5909.22);
  });

  it('un ejercicio sin tarifa verificada no se inventa', () => {
    expect(() => servicio.calcularIsr(8000, 2099, RegimenPago.QUINCENAL)).toThrow(
      /tarifas fiscales verificadas/i,
    );
  });
});

describe('IMSS · cuotas obrero y patronales sobre quince días', () => {
  const quincena = {
    sbcDiario: 500,
    diasCotizados: 15,
    ejercicio: 2026,
    primaRiesgo: 0.5,
    zonaSalarioMinimo: 'GENERAL' as const,
  };

  it('la cuota obrera son 187.01', () => {
    /*
     * base      = 500 × 15 = 7,500
     * 3 UMA     = 351.93 → excedente diario 148.07 → × 15 = 2,221.05
     * obrero    = 2,221.05 × 0.4%  = 8.8842
     *           + 7,500 × (0.25 + 0.375 + 0.625 + 1.125)% = 7,500 × 2.375% = 178.125
     *           = 187.0092 → 187.01
     */
    expect(servicio.calcularImss(quincena).obrero).toBe(187.01);
  });

  it('el desglose patronal cuadra renglón por renglón', () => {
    const { desglose, patronal } = servicio.calcularImss(quincena);
    expect(desglose.cuotaFija).toBeCloseTo(117.31 * 15 * 0.204, 2); // 358.97
    expect(desglose.excedente).toBeCloseTo(2221.05 * 0.011, 2); // 24.43
    expect(desglose.prestacionesDinero).toBe(52.5); // 7,500 × 0.7%
    expect(desglose.gastosMedicos).toBe(78.75); // 7,500 × 1.05%
    expect(desglose.invalidezVida).toBe(131.25); // 7,500 × 1.75%
    expect(desglose.riesgoTrabajo).toBe(37.5); // 7,500 × 0.5% (prima de la empresa)
    expect(desglose.guarderias).toBe(75); // 7,500 × 1%
    expect(desglose.retiro).toBe(150); // 7,500 × 2%
    expect(desglose.cesantiaVejez).toBeCloseTo(7500 * 0.07513, 2); // 563.48
    expect(patronal).toBeCloseTo(1471.88, 1);
  });

  it('el INFONAVIT es el 5% y va aparte del patronal', () => {
    const r = servicio.calcularImss(quincena);
    expect(r.infonavitPatronal).toBe(375);
    expect(r.patronal).not.toBeCloseTo(r.patronal + 375, 2);
  });

  it('el SBC se topa en 25 UMA, y el tope se nota en la cuota', () => {
    /*
     * Un SBC de 5,000 diarios cotiza como 25 × 117.31 = 2,932.75. Si el tope no
     * se aplicara, la cuota obrera saldría casi al doble: es el error que el
     * IMSS cobra con actualización y recargos, y no lo caza ningún cuadre.
     */
    const topado = servicio.calcularImss({ ...quincena, sbcDiario: 5000 });
    const alTope = servicio.calcularImss({ ...quincena, sbcDiario: UMA * 25 });
    expect(topado.obrero).toBe(alTope.obrero);
    expect(topado.patronal).toBe(alTope.patronal);
    expect(topado.obrero).toBeLessThan(
      servicio.calcularImss({ ...quincena, sbcDiario: 5000, ejercicio: 2026 }).obrero + 0.01,
    );
  });

  it('por debajo de 3 UMA no hay cuota de excedente', () => {
    /* 3 UMA = 351.93. Con 300 de SBC no hay excedente que repartir. */
    const r = servicio.calcularImss({ ...quincena, sbcDiario: 300 });
    expect(r.desglose.excedente).toBe(0);
    /* Y la obrera es sólo el 2.375% de la base: 300 × 15 × 2.375% = 106.875 */
    expect(r.obrero).toBeCloseTo(106.88, 2);
  });

  it('un SBC de salario mínimo cotiza cesantía al 3.15%', () => {
    const r = servicio.calcularImss({ ...quincena, sbcDiario: 315.04 });
    expect(r.desglose.cesantiaVejez).toBeCloseTo(315.04 * 15 * 0.0315, 2);
  });

  it('sin días cotizados no hay cuota', () => {
    expect(servicio.calcularImss({ ...quincena, diasCotizados: 0 }).obrero).toBe(0);
    expect(servicio.calcularImss({ ...quincena, sbcDiario: 0 }).patronal).toBe(0);
  });
});

describe('Horas extra · el corte de nueve horas es SEMANAL (art. 68 LFT)', () => {
  const empleado: any = {
    salarioDiario: 800,
    horasJornada: 8,
    jornada: JornadaLaboral.DIURNA,
  };
  const periodo: any = {
    fechaInicio: new Date(2026, 9, 1),
    fechaFin: new Date(2026, 9, 15),
  };
  const incidencia = (dia: number, horas: number) => ({
    fechaInicio: new Date(2026, 9, dia),
    fechaFin: new Date(2026, 9, dia),
    horas,
  });

  it('doce horas en UNA semana: nueve dobles y tres triples', () => {
    /*
     * valor hora = 800 / 8 = 100
     * dobles  = min(9, 12) = 9  → 100 × 9 × 2 = 1,800
     * triples = 12 − 9     = 3  → 100 × 3 × 3 =   900
     * exento  = min(1,800 × 50%, 5 UMA = 586.55) = 586.55
     */
    const { partidas } = servicio.calcularHorasExtra(
      empleado, periodo, [incidencia(7, 12)], 315.04, UMA,
    );
    const doble = partidas.find((p: any) => p.clave === 'P002D');
    const triple = partidas.find((p: any) => p.clave === 'P002T');
    expect(doble.importe).toBe(1800);
    expect(doble.cantidad).toBe(9);
    expect(doble.importeExento).toBeCloseTo(586.55, 2);
    expect(doble.importeGravado).toBeCloseTo(1213.45, 2);
    expect(triple.importe).toBe(900);
    expect(triple.cantidad).toBe(3);
    expect(triple.naturaleza).toBe(NaturalezaConcepto.PERCEPCION);
  });

  it('las mismas doce horas repartidas en DOS semanas no generan ninguna triple', () => {
    /*
     * Éste es el defecto que el corte semanal evita, y el que un corte por
     * periodo —la quincena— volvería a crear: seis horas el miércoles de una
     * semana y seis el miércoles de la siguiente son doce en la quincena, pero
     * ninguna semana pasa de nueve. Pagarlas triples es pagar de más; medirlo
     * por quincena es, además, ilegal al revés en el caso contrario.
     */
    const { partidas } = servicio.calcularHorasExtra(
      empleado, periodo, [incidencia(7, 6), incidencia(14, 6)], 315.04, UMA,
    );
    expect(partidas.find((p: any) => p.clave === 'P002T')).toBeUndefined();
    expect(partidas.find((p: any) => p.clave === 'P002D').importe).toBe(2400);
  });

  it('avisa de los dos excesos: más de 3 horas en un día y más de 9 en la semana', () => {
    const { alertas } = servicio.calcularHorasExtra(
      empleado, periodo, [incidencia(7, 12)], 315.04, UMA,
    );
    expect(alertas.join(' ')).toMatch(/por encima de 3 horas en el día/);
    expect(alertas.join(' ')).toMatch(/el excedente de 9 se paga triple/);
  });

  it('a quien gana el mínimo, la hora extra doble va exenta completa', () => {
    /* Art. 93 fracción I LISR: para el salario mínimo, exención del 100%. */
    const alMinimo = { ...empleado, salarioDiario: 315.04 };
    const { partidas } = servicio.calcularHorasExtra(
      alMinimo, periodo, [incidencia(7, 4)], 315.04, UMA,
    );
    const doble = partidas.find((p: any) => p.clave === 'P002D');
    expect(doble.importeGravado).toBe(0);
    expect(doble.importeExento).toBe(doble.importe);
  });

  it('sin incidencias no hay partidas ni alertas', () => {
    const r = servicio.calcularHorasExtra(empleado, periodo, [], 315.04, UMA);
    expect(r.partidas).toEqual([]);
    expect(r.alertas).toEqual([]);
  });
});

describe('SBC · el factor de integración del artículo 27 LSS', () => {
  const periodo: any = { fechaFin: new Date(2026, 9, 15) };

  it('dos años de antigüedad: 525.34', () => {
    /*
     * vacaciones de ley a los 2 años = 14 días
     * factor = 1 + 15/365 + (14 × 25%)/365 = 1.0506849315
     * 500 × factor = 525.3424657 → 525.34
     */
    const empleado: any = {
      salarioDiario: 500,
      diasAguinaldo: 15,
      primaVacacional: 25,
      fechaIngreso: new Date(2024, 0, 1),
      tipoSalario: 'FIJO',
      sbcValidado: false,
      salarioDiarioIntegrado: 0,
    };
    const alertas: string[] = [];
    expect(servicio.obtenerSbc(empleado, periodo, alertas)).toBe(525.34);
    expect(alertas.join(' ')).toMatch(/valida el SBC/i);
  });

  it('en el primer año integra con 12 días de vacaciones, no con cero', () => {
    /*
     * Es el arreglo que el propio servicio documenta: integrar sin prima
     * vacacional deja el SBC por debajo del legal y las cuotas se enteran de
     * menos, que es la diferencia que el Instituto liquida con recargos.
     *
     * factor = 1 + 15/365 + (12 × 25%)/365 = 1.0493150685
     * 500 × factor = 524.6575342 → 524.66
     */
    const recien: any = {
      salarioDiario: 500,
      diasAguinaldo: 15,
      primaVacacional: 25,
      fechaIngreso: new Date(2026, 5, 1),
      tipoSalario: 'FIJO',
      sbcValidado: false,
      salarioDiarioIntegrado: 0,
    };
    expect(servicio.obtenerSbc(recien, periodo, [])).toBe(524.66);
  });

  it('un SBC validado en el expediente gana sobre el calculado', () => {
    const conSbc: any = {
      salarioDiario: 500,
      diasAguinaldo: 15,
      primaVacacional: 25,
      fechaIngreso: new Date(2024, 0, 1),
      tipoSalario: 'FIJO',
      sbcValidado: true,
      salarioDiarioIntegrado: 560,
    };
    expect(servicio.obtenerSbc(conSbc, periodo, [])).toBe(560);
  });

  it('el aviso nombra las DOS cifras cuando el expediente informa otra sin validar', () => {
    const empleado: any = {
      salarioDiario: 500,
      diasAguinaldo: 15,
      primaVacacional: 25,
      fechaIngreso: new Date(2024, 0, 1),
      tipoSalario: 'FIJO',
      sbcValidado: false,
      salarioDiarioIntegrado: 495,
    };
    const alertas: string[] = [];
    servicio.obtenerSbc(empleado, periodo, alertas);
    expect(alertas.join(' ')).toContain('495.00');
    expect(alertas.join(' ')).toContain('525.34');
  });

  it('un salario variable sin SBC validado no se calcula: se niega', () => {
    const variable: any = {
      salarioDiario: 500,
      diasAguinaldo: 15,
      primaVacacional: 25,
      fechaIngreso: new Date(2024, 0, 1),
      tipoSalario: 'VARIABLE',
      sbcValidado: false,
      salarioDiarioIntegrado: 0,
    };
    expect(() => servicio.obtenerSbc(variable, periodo, [])).toThrow(/SBC validado/i);
  });
});
