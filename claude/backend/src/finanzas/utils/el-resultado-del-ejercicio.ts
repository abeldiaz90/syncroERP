/**
 * ============================================================================
 * EL TRASPASO DE RESULTADO, EN ARITMÉTICA PURA
 * ----------------------------------------------------------------------------
 * Cerrar un ejercicio es una sola idea: las cuentas de INGRESO, COSTO y GASTO
 * cuentan lo que pasó **durante un año**, así que el 31 de diciembre tienen que
 * quedar en cero y su diferencia —el resultado— mudarse al capital.
 *
 * Si no se hace, el 2 de enero el estado de resultados sigue enseñando las
 * ventas del año pasado y el balance no cuadra contra el capital contable. No
 * es un reporte feo: es que a partir de ese día los dos estados financieros
 * dicen cosas distintas, y nadie lo nota hasta la declaración anual.
 *
 * ── POR QUÉ SE SALDA POR CUENTA Y CENTRO, NO SÓLO POR CUENTA ──────────────
 *
 * Porque desde los centros de costo, el resultado del ejercicio también se mira
 * por centro. Una póliza de cierre que saldara sólo por cuenta dejaría cada
 * centro con su saldo intacto, y el «resultado por centro» de enero arrastraría
 * el del año anterior. El total daría cero y la dimensión no.
 *
 * Esto vive aparte del servicio y sin base de datos porque la aritmética del
 * cierre es lo que hay que poder probar renglón por renglón: el servicio es
 * quien lee los saldos y escribe la póliza, pero quien decide qué carga y qué
 * abona es esto.
 * ============================================================================
 */

/** Las tres familias que se saldan. El resto —balance— no se toca. */
export const TIPOS_DE_RESULTADO = ['INGRESO', 'COSTO', 'GASTO'] as const;
export type TipoDeResultado = (typeof TIPOS_DE_RESULTADO)[number];

/** Menos de un centavo no es un saldo: es el polvo de los redondeos. */
export const CENTAVO = 0.005;

export interface SaldoDeCuenta {
  cuentaContableId: string;
  numeroCuenta: string;
  nombre: string;
  tipo: TipoDeResultado;
  centroCostoId: string | null;
  cargos: number;
  abonos: number;
}

export interface PartidaDeCierre {
  cuentaContableId: string;
  cargo: number;
  abono: number;
  referencia: string;
  centroCostoId: string | null;
}

export interface Traspaso {
  partidas: PartidaDeCierre[];
  /** Positivo = utilidad; negativo = pérdida. */
  resultado: number;
  totalIngresos: number;
  totalCostos: number;
  totalGastos: number;
  /** Cuántas cuentas se saldaron, para que la pantalla no mienta con un cero. */
  cuentasSaldadas: number;
}

const redondear = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Arma las partidas que dejan en cero las cuentas de resultado.
 *
 * El saldo de cada cuenta se neutraliza con su contrario: una cuenta con saldo
 * acreedor —el caso normal de un ingreso— se **carga** por ese importe, y una
 * con saldo deudor —costos y gastos— se **abona**. No se mira el tipo de cuenta
 * para decidir el lado, se mira el SALDO: un ingreso con saldo deudor existe
 * —devoluciones por encima de las ventas de un centro— y asumir lo contrario
 * habría producido una póliza que infla las dos columnas en vez de saldar.
 */
export function armarTraspaso(
  saldos: SaldoDeCuenta[],
  cuentas: { utilidadId: string; perdidaId?: string | null },
  referencia: string,
): Traspaso {
  const partidas: PartidaDeCierre[] = [];
  let acumulado = 0;
  let totalIngresos = 0;
  let totalCostos = 0;
  let totalGastos = 0;

  for (const s of saldos) {
    /* Saldo positivo = deudor; negativo = acreedor. */
    const saldo = redondear(Number(s.cargos ?? 0) - Number(s.abonos ?? 0));
    if (Math.abs(saldo) < CENTAVO) continue;

    if (s.tipo === 'INGRESO') totalIngresos += -saldo;
    else if (s.tipo === 'COSTO') totalCostos += saldo;
    else totalGastos += saldo;

    /* Lo contrario del saldo: así queda en cero. */
    partidas.push({
      cuentaContableId: s.cuentaContableId,
      cargo: saldo < 0 ? Math.abs(saldo) : 0,
      abono: saldo > 0 ? saldo : 0,
      referencia: `${referencia} · ${s.numeroCuenta}`,
      centroCostoId: s.centroCostoId,
    });
    acumulado += saldo;
  }

  /*
   * El resultado es lo que falta para cuadrar la póliza, y se calcula como la
   * suma de los saldos con el signo cambiado: `acumulado` es deudor positivo,
   * así que una utilidad —más abonos que cargos— llega aquí como negativo.
   */
  const resultado = redondear(-acumulado);

  if (Math.abs(resultado) >= CENTAVO) {
    const esUtilidad = resultado > 0;
    /*
     * La pérdida va a su propia cuenta sólo si la empresa la configuró. Sin
     * ella se asienta como cargo en la de utilidad: el saldo deudor ya dice
     * que fue pérdida, y negarse a cerrar el año por un renglón de catálogo
     * sería desproporcionado.
     */
    const destino =
      !esUtilidad && cuentas.perdidaId ? cuentas.perdidaId : cuentas.utilidadId;
    partidas.push({
      cuentaContableId: destino,
      /* Utilidad: abono al capital. Pérdida: cargo. */
      cargo: esUtilidad ? 0 : Math.abs(resultado),
      abono: esUtilidad ? resultado : 0,
      referencia: `${referencia} · ${esUtilidad ? 'utilidad' : 'pérdida'} del ejercicio`,
      /*
       * La cuenta de capital NO lleva centro: el resultado es de la empresa
       * entera. Repartirlo entre centros exigiría una regla de reparto que
       * nadie ha decidido, y una inventada aquí se volvería doctrina.
       */
      centroCostoId: null,
    });
  }

  return {
    partidas,
    resultado,
    totalIngresos: redondear(totalIngresos),
    totalCostos: redondear(totalCostos),
    totalGastos: redondear(totalGastos),
    cuentasSaldadas: partidas.length - (Math.abs(resultado) >= CENTAVO ? 1 : 0),
  };
}
