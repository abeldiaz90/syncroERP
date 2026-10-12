import {
  armarTraspaso,
  SaldoDeCuenta,
} from './el-resultado-del-ejercicio';

/**
 * ============================================================================
 * EL AÑO CIERRA EN CERO, O NO CIERRA
 * ----------------------------------------------------------------------------
 * Cerrar un ejercicio es una sola idea: las cuentas de ingreso, costo y gasto
 * cuentan lo que pasó DURANTE un año, así que el 31 de diciembre tienen que
 * quedar en cero y su diferencia mudarse al capital.
 *
 * Sin el traspaso, el 2 de enero el estado de resultados sigue enseñando las
 * ventas del año pasado y el balance no cuadra contra el capital contable. Los
 * dos estados financieros dicen cosas distintas, y eso se descubre en la
 * declaración anual.
 *
 * Estas pruebas miden la aritmética renglón por renglón. Lo que cuidan:
 *
 *   1. Cada cuenta queda EN CERO: se le aplica lo contrario de su saldo.
 *   2. El lado se decide por el SALDO, no por el tipo de cuenta.
 *   3. La póliza CUADRA, que es lo único que la contabilidad no perdona.
 *   4. Se salda por cuenta Y CENTRO, o la dimensión arrastra el año anterior.
 * ============================================================================
 */

const UTILIDAD = 'cta-utilidad';
const PERDIDA = 'cta-perdida';

const saldo = (s: Partial<SaldoDeCuenta>): SaldoDeCuenta => ({
  cuentaContableId: s.cuentaContableId ?? 'c1',
  numeroCuenta: s.numeroCuenta ?? '401-01',
  nombre: s.nombre ?? 'Cuenta',
  tipo: s.tipo ?? 'INGRESO',
  centroCostoId: s.centroCostoId ?? null,
  cargos: s.cargos ?? 0,
  abonos: s.abonos ?? 0,
});

/** Lo único que la contabilidad no perdona. */
const cuadra = (partidas: Array<{ cargo: number; abono: number }>) => {
  const debe = partidas.reduce((a, p) => a + p.cargo, 0);
  const haber = partidas.reduce((a, p) => a + p.abono, 0);
  return Math.abs(debe - haber) < 0.005;
};

describe('el traspaso del resultado', () => {
  it('deja cada cuenta en cero y manda la utilidad al capital', () => {
    /* Ventas 100,000 (acreedor) · costo 60,000 · gastos 25,000 → utilidad 15,000. */
    const t = armarTraspaso(
      [
        saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 100000 }),
        saldo({ cuentaContableId: 'costo', tipo: 'COSTO', cargos: 60000 }),
        saldo({ cuentaContableId: 'gastos', tipo: 'GASTO', cargos: 25000 }),
      ],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );

    expect(t.resultado).toBe(15000);
    expect(cuadra(t.partidas)).toBe(true);

    /* Cada cuenta recibe lo contrario de su saldo: así queda en cero. */
    const porCuenta = new Map(t.partidas.map((p) => [p.cuentaContableId, p]));
    expect(porCuenta.get('ventas')).toMatchObject({ cargo: 100000, abono: 0 });
    expect(porCuenta.get('costo')).toMatchObject({ cargo: 0, abono: 60000 });
    expect(porCuenta.get('gastos')).toMatchObject({ cargo: 0, abono: 25000 });
    /* Y la utilidad se ABONA al capital. */
    expect(porCuenta.get(UTILIDAD)).toMatchObject({ cargo: 0, abono: 15000 });
  });

  it('una pérdida se CARGA al capital, y cuadra igual', () => {
    const t = armarTraspaso(
      [
        saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 40000 }),
        saldo({ cuentaContableId: 'gastos', tipo: 'GASTO', cargos: 55000 }),
      ],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    expect(t.resultado).toBe(-15000);
    expect(cuadra(t.partidas)).toBe(true);
    const capital = t.partidas.find((p) => p.cuentaContableId === UTILIDAD);
    expect(capital).toMatchObject({ cargo: 15000, abono: 0 });
  });

  it('usa la cuenta de pérdida cuando la empresa la configuró', () => {
    const t = armarTraspaso(
      [saldo({ cuentaContableId: 'gastos', tipo: 'GASTO', cargos: 1000 })],
      { utilidadId: UTILIDAD, perdidaId: PERDIDA },
      'Cierre 2026',
    );
    expect(t.partidas.find((p) => p.cargo === 1000 && p.cuentaContableId === PERDIDA)).toBeDefined();
  });

  it('sin cuenta de pérdida configurada no se niega a cerrar el año', () => {
    /*
     * Separar 305.01 de 305.02 es más fiel al catálogo del SAT, pero el saldo
     * deudor en la cuenta de utilidad ya identifica la pérdida. Negarse a
     * cerrar el ejercicio por un renglón de catálogo sería desproporcionado.
     */
    const t = armarTraspaso(
      [saldo({ cuentaContableId: 'gastos', tipo: 'GASTO', cargos: 1000 })],
      { utilidadId: UTILIDAD, perdidaId: null },
      'Cierre 2026',
    );
    expect(t.partidas.find((p) => p.cuentaContableId === UTILIDAD)).toMatchObject({
      cargo: 1000,
    });
  });

  it('el lado lo decide el SALDO, no el tipo de cuenta', () => {
    /*
     * Un ingreso con saldo DEUDOR existe: devoluciones por encima de las ventas
     * de ese centro. Si se diera por hecho que todo ingreso es acreedor, la
     * póliza cargaría una cuenta que ya estaba cargada: en vez de saldar,
     * inflaría las dos columnas y el resultado saldría al revés.
     */
    const t = armarTraspaso(
      [saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', cargos: 5000, abonos: 2000 })],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    const ventas = t.partidas.find((p) => p.cuentaContableId === 'ventas');
    expect(ventas).toMatchObject({ cargo: 0, abono: 3000 });
    expect(t.resultado).toBe(-3000);
    expect(cuadra(t.partidas)).toBe(true);
  });

  it('salda por cuenta Y CENTRO, no sólo por cuenta', () => {
    /*
     * Si se saldara sólo por cuenta, el total daría cero y cada centro se
     * quedaría con su saldo: el «resultado por centro» de enero arrastraría el
     * del año anterior. El total cuadra y la dimensión no, que es la peor de
     * las dos formas de estar mal — porque el número de arriba se ve bien.
     */
    const t = armarTraspaso(
      [
        saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 60000, centroCostoId: 'norte' }),
        saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 40000, centroCostoId: 'sur' }),
      ],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    const ventas = t.partidas.filter((p) => p.cuentaContableId === 'ventas');
    expect(ventas).toHaveLength(2);
    expect(ventas.map((p) => [p.centroCostoId, p.cargo]).sort()).toEqual([
      ['norte', 60000],
      ['sur', 40000],
    ]);
    /* Y el resultado NO lleva centro: es de la empresa entera, y repartirlo
       exigiría una regla que nadie ha decidido. */
    expect(t.partidas.find((p) => p.cuentaContableId === UTILIDAD)?.centroCostoId).toBeNull();
  });

  it('no mueve las cuentas de balance', () => {
    /* El servicio ya filtra por tipo en la consulta; esto fija que la
       aritmética tampoco inventaría una partida si llegara una de más. */
    const t = armarTraspaso(
      [saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 1000 })],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    expect(t.partidas.map((p) => p.cuentaContableId).sort()).toEqual([
      UTILIDAD,
      'ventas',
    ]);
  });

  it('ignora el polvo de los redondeos', () => {
    /* Medio centavo no es un saldo: es lo que dejan las divisiones. Una
       partida por $0.004 ensucia la póliza y no corrige nada. */
    const t = armarTraspaso(
      [saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 0.004 })],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    expect(t.partidas).toEqual([]);
    expect(t.cuentasSaldadas).toBe(0);
  });

  it('un ejercicio que cerró exactamente en cero no inventa una partida de capital', () => {
    /*
     * Ingresos iguales a gastos. Las cuentas hay que saldarlas igual, pero no
     * hay resultado que mandar al capital, y una partida de cero sería un
     * renglón que alguien tendría que explicar.
     */
    const t = armarTraspaso(
      [
        saldo({ cuentaContableId: 'ventas', tipo: 'INGRESO', abonos: 10000 }),
        saldo({ cuentaContableId: 'gastos', tipo: 'GASTO', cargos: 10000 }),
      ],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    expect(t.resultado).toBe(0);
    expect(t.partidas.some((p) => p.cuentaContableId === UTILIDAD)).toBe(false);
    expect(t.cuentasSaldadas).toBe(2);
    expect(cuadra(t.partidas)).toBe(true);
  });

  it('el resumen separa ingresos, costos y gastos', () => {
    const t = armarTraspaso(
      [
        saldo({ cuentaContableId: 'v', tipo: 'INGRESO', abonos: 100000 }),
        saldo({ cuentaContableId: 'c', tipo: 'COSTO', cargos: 60000 }),
        saldo({ cuentaContableId: 'g', tipo: 'GASTO', cargos: 25000 }),
      ],
      { utilidadId: UTILIDAD },
      'Cierre 2026',
    );
    expect(t.totalIngresos).toBe(100000);
    expect(t.totalCostos).toBe(60000);
    expect(t.totalGastos).toBe(25000);
    expect(t.resultado).toBe(t.totalIngresos - t.totalCostos - t.totalGastos);
  });
});
