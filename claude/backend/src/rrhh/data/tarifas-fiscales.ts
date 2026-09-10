/**
 * Tarifas fiscales de nómina verificadas por ejercicio.
 *
 * Reglas de seguridad:
 * - No se hereda silenciosamente una tarifa de otro año.
 * - Las tarifas ISR se seleccionan por periodicidad del periodo.
 * - Los importes se redondean por recibo, nunca por acumulado global.
 *
 * Fuentes 2026:
 * - SAT, Anexo 8 RMF 2026 (tarifas del artículo 96 LISR).
 * - Decreto de subsidio para el empleo publicado el 31/12/2025.
 * - INEGI, UMA 2026.
 * - CONASAMI, salarios mínimos 2026.
 * - LSS y transición de cuotas patronales de cesantía y vejez.
 */

import { RegimenPago } from '../entities/rrhh.entity';

export interface RenglonIsr {
  limiteInferior: number;
  limiteSuperior: number;
  cuotaFija: number;
  porcentaje: number;
}

export interface CuotasImssObrero {
  excedente: number;
  prestacionesDinero: number;
  gastosMedicos: number;
  invalidezVida: number;
  cesantiaVejez: number;
}

export interface CuotasImssPatronal {
  cuotaFijaUma: number;
  excedente: number;
  prestacionesDinero: number;
  gastosMedicos: number;
  invalidezVida: number;
  guarderias: number;
  retiro: number;
  infonavit: number;
}

export interface RenglonCesantiaPatronal {
  desdeUma: number;
  hastaUma: number;
  porcentaje: number;
  /** El primer rango se determina contra salario mínimo, no UMA. */
  usaSalarioMinimo?: boolean;
}

export interface SubsidioEmpleoEjercicio {
  limiteIngresoMensual: number;
  porcentajeUmaMensual: number;
  /** Enero 2026 mantiene el importe usando UMA anterior y porcentaje transitorio. */
  porcentajeEnero?: number;
}

export interface TarifasEjercicio {
  ejercicio: number;
  umaDiaria: number;
  umaMensual: number;
  salarioMinimoGeneral: number;
  salarioMinimoFronteraNorte?: number;
  isr: Record<RegimenPago, RenglonIsr[]>;
  subsidioEmpleo: SubsidioEmpleoEjercicio;
  imssObrero: CuotasImssObrero;
  imssPatronal: CuotasImssPatronal;
  cesantiaVejezPatronal: RenglonCesantiaPatronal[];
}

const ISR_MENSUAL_2025: RenglonIsr[] = [
  [0.01, 746.04, 0, 1.92],
  [746.05, 6332.05, 14.32, 6.4],
  [6332.06, 11128.01, 371.83, 10.88],
  [11128.02, 12935.82, 893.63, 16],
  [12935.83, 15487.71, 1182.88, 17.92],
  [15487.72, 31236.49, 1640.18, 21.36],
  [31236.5, 49233, 5004.12, 23.52],
  [49233.01, 93993.9, 9236.89, 30],
  [93993.91, 125325.2, 22665.17, 32],
  [125325.21, 375975.61, 32691.18, 34],
  [375975.62, Infinity, 117912.32, 35],
].map(([limiteInferior, limiteSuperior, cuotaFija, porcentaje]) => ({
  limiteInferior,
  limiteSuperior,
  cuotaFija,
  porcentaje,
}));

const ISR_DIARIO_2026: RenglonIsr[] = [
  [0.01, 27.78, 0, 1.92],
  [27.79, 235.81, 0.53, 6.4],
  [235.82, 414.41, 13.85, 10.88],
  [414.42, 481.73, 33.28, 16],
  [481.74, 576.76, 44.05, 17.92],
  [576.77, 1163.25, 61.08, 21.36],
  [1163.26, 1833.44, 186.35, 23.52],
  [1833.45, 3500.35, 343.98, 30],
  [3500.36, 4667.13, 844.05, 32],
  [4667.14, 14001.38, 1217.42, 34],
  [14001.39, Infinity, 4391.07, 35],
].map(([limiteInferior, limiteSuperior, cuotaFija, porcentaje]) => ({
  limiteInferior,
  limiteSuperior,
  cuotaFija,
  porcentaje,
}));

const ISR_SEMANAL_2026: RenglonIsr[] = [
  [0.01, 194.46, 0, 1.92],
  [194.47, 1650.67, 3.71, 6.4],
  [1650.68, 2900.87, 96.95, 10.88],
  [2900.88, 3372.11, 232.96, 16],
  [3372.12, 4037.32, 308.35, 17.92],
  [4037.33, 8142.75, 427.56, 21.36],
  [8142.76, 12834.08, 1304.45, 23.52],
  [12834.09, 24502.45, 2407.86, 30],
  [24502.46, 32669.91, 5908.35, 32],
  [32669.92, 98009.66, 8521.94, 34],
  [98009.67, Infinity, 30737.49, 35],
].map(([limiteInferior, limiteSuperior, cuotaFija, porcentaje]) => ({
  limiteInferior,
  limiteSuperior,
  cuotaFija,
  porcentaje,
}));

const ISR_QUINCENAL_2026: RenglonIsr[] = [
  [0.01, 416.7, 0, 1.92],
  [416.71, 3537.15, 7.95, 6.4],
  [3537.16, 6216.15, 207.75, 10.88],
  [6216.16, 7225.95, 499.2, 16],
  [7225.96, 8651.4, 660.75, 17.92],
  [8651.41, 17448.75, 916.2, 21.36],
  [17448.76, 27501.6, 2795.25, 23.52],
  [27501.61, 52505.25, 5159.7, 30],
  [52505.26, 70006.95, 12660.75, 32],
  [70006.96, 210020.7, 18261.3, 34],
  [210020.71, Infinity, 65866.05, 35],
].map(([limiteInferior, limiteSuperior, cuotaFija, porcentaje]) => ({
  limiteInferior,
  limiteSuperior,
  cuotaFija,
  porcentaje,
}));

const ISR_MENSUAL_2026: RenglonIsr[] = [
  [0.01, 844.59, 0, 1.92],
  [844.6, 7168.51, 16.22, 6.4],
  [7168.52, 12598.02, 420.95, 10.88],
  [12598.03, 14644.64, 1011.68, 16],
  [14644.65, 17533.64, 1339.14, 17.92],
  [17533.65, 35362.83, 1856.84, 21.36],
  [35362.84, 55736.68, 5665.16, 23.52],
  [55736.69, 106410.5, 10457.09, 30],
  [106410.51, 141880.66, 25659.23, 32],
  [141880.67, 425641.99, 37009.69, 34],
  [425642, Infinity, 133488.54, 35],
].map(([limiteInferior, limiteSuperior, cuotaFija, porcentaje]) => ({
  limiteInferior,
  limiteSuperior,
  cuotaFija,
  porcentaje,
}));

function escalarTarifaDiaria(dias: number): RenglonIsr[] {
  return ISR_DIARIO_2026.map((r, index) => ({
    limiteInferior: index === 0 ? 0.01 : redondearFiscal(r.limiteInferior * dias),
    limiteSuperior:
      r.limiteSuperior === Infinity
        ? Infinity
        : redondearFiscal(r.limiteSuperior * dias),
    cuotaFija: redondearFiscal(r.cuotaFija * dias),
    porcentaje: r.porcentaje,
  }));
}

function escalarMensual2025(dias: number): RenglonIsr[] {
  const factor = dias / 30.4;
  return ISR_MENSUAL_2025.map((r, index) => ({
    limiteInferior:
      index === 0 ? 0.01 : redondearFiscal(r.limiteInferior * factor),
    limiteSuperior:
      r.limiteSuperior === Infinity
        ? Infinity
        : redondearFiscal(r.limiteSuperior * factor),
    cuotaFija: redondearFiscal(r.cuotaFija * factor),
    porcentaje: r.porcentaje,
  }));
}

function redondearFiscal(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

const IMSS_OBRERO: CuotasImssObrero = {
  excedente: 0.4,
  prestacionesDinero: 0.25,
  gastosMedicos: 0.375,
  invalidezVida: 0.625,
  cesantiaVejez: 1.125,
};

const IMSS_PATRONAL: CuotasImssPatronal = {
  cuotaFijaUma: 20.4,
  excedente: 1.1,
  prestacionesDinero: 0.7,
  gastosMedicos: 1.05,
  invalidezVida: 1.75,
  guarderias: 1,
  retiro: 2,
  infonavit: 5,
};

const CESANTIA_2025: RenglonCesantiaPatronal[] = [
  { desdeUma: 0, hastaUma: 1, porcentaje: 3.15, usaSalarioMinimo: true },
  { desdeUma: 1.000001, hastaUma: 1.5, porcentaje: 3.544 },
  { desdeUma: 1.500001, hastaUma: 2, porcentaje: 4.426 },
  { desdeUma: 2.000001, hastaUma: 2.5, porcentaje: 4.954 },
  { desdeUma: 2.500001, hastaUma: 3, porcentaje: 5.307 },
  { desdeUma: 3.000001, hastaUma: 3.5, porcentaje: 5.559 },
  { desdeUma: 3.500001, hastaUma: 4, porcentaje: 5.747 },
  { desdeUma: 4.000001, hastaUma: Infinity, porcentaje: 6.422 },
];

const CESANTIA_2026: RenglonCesantiaPatronal[] = [
  { desdeUma: 0, hastaUma: 1, porcentaje: 3.15, usaSalarioMinimo: true },
  { desdeUma: 1.000001, hastaUma: 1.5, porcentaje: 3.676 },
  { desdeUma: 1.500001, hastaUma: 2, porcentaje: 4.851 },
  { desdeUma: 2.000001, hastaUma: 2.5, porcentaje: 5.556 },
  { desdeUma: 2.500001, hastaUma: 3, porcentaje: 6.026 },
  { desdeUma: 3.000001, hastaUma: 3.5, porcentaje: 6.361 },
  { desdeUma: 3.500001, hastaUma: 4, porcentaje: 6.613 },
  { desdeUma: 4.000001, hastaUma: Infinity, porcentaje: 7.513 },
];

export const TARIFAS: Record<number, TarifasEjercicio> = {
  2025: {
    ejercicio: 2025,
    umaDiaria: 113.14,
    umaMensual: 3439.46,
    salarioMinimoGeneral: 278.8,
    salarioMinimoFronteraNorte: 419.88,
    isr: {
      [RegimenPago.SEMANAL]: escalarMensual2025(7),
      [RegimenPago.CATORCENAL]: escalarMensual2025(14),
      [RegimenPago.QUINCENAL]: escalarMensual2025(15),
      [RegimenPago.MENSUAL]: ISR_MENSUAL_2025,
    },
    subsidioEmpleo: {
      limiteIngresoMensual: 10171,
      porcentajeUmaMensual: 13.8,
    },
    imssObrero: IMSS_OBRERO,
    imssPatronal: IMSS_PATRONAL,
    cesantiaVejezPatronal: CESANTIA_2025,
  },
  2026: {
    ejercicio: 2026,
    umaDiaria: 117.31,
    umaMensual: 3566.22,
    salarioMinimoGeneral: 315.04,
    salarioMinimoFronteraNorte: 440.87,
    isr: {
      [RegimenPago.SEMANAL]: ISR_SEMANAL_2026,
      [RegimenPago.CATORCENAL]: escalarTarifaDiaria(14),
      [RegimenPago.QUINCENAL]: ISR_QUINCENAL_2026,
      [RegimenPago.MENSUAL]: ISR_MENSUAL_2026,
    },
    subsidioEmpleo: {
      limiteIngresoMensual: 11492.66,
      porcentajeUmaMensual: 15.02,
      porcentajeEnero: 15.59,
    },
    imssObrero: IMSS_OBRERO,
    imssPatronal: IMSS_PATRONAL,
    cesantiaVejezPatronal: CESANTIA_2026,
  },
};

export function obtenerTarifas(ejercicio: number): TarifasEjercicio {
  const tarifas = TARIFAS[ejercicio];
  if (!tarifas) {
    const disponibles = Object.keys(TARIFAS).join(', ');
    throw new Error(
      `No hay tarifas fiscales verificadas para ${ejercicio}. ` +
        `Ejercicios disponibles: ${disponibles}.`,
    );
  }
  return tarifas;
}

export function obtenerTarifaIsr(
  ejercicio: number,
  regimen: RegimenPago,
): RenglonIsr[] {
  const tarifa = obtenerTarifas(ejercicio).isr[regimen];
  if (!tarifa?.length) {
    throw new Error(`No existe tarifa ISR para ${ejercicio}/${regimen}.`);
  }
  return tarifa;
}

export function calcularSubsidioPeriodo(params: {
  ejercicio: number;
  baseGravable: number;
  diasPeriodo: number;
  fechaPago: Date;
}): number {
  const { ejercicio, baseGravable, diasPeriodo, fechaPago } = params;
  const tarifas = obtenerTarifas(ejercicio);
  if (baseGravable <= 0 || diasPeriodo <= 0) return 0;

  const factor = Math.min(diasPeriodo / 30.4, 1);
  const limitePeriodo = tarifas.subsidioEmpleo.limiteIngresoMensual * factor;
  if (baseGravable > limitePeriodo) return 0;

  const esEnero2026 = ejercicio === 2026 && fechaPago.getMonth() === 0;
  const porcentaje =
    esEnero2026 && tarifas.subsidioEmpleo.porcentajeEnero
      ? tarifas.subsidioEmpleo.porcentajeEnero
      : tarifas.subsidioEmpleo.porcentajeUmaMensual;
  const umaMensual = esEnero2026 ? TARIFAS[2025].umaMensual : tarifas.umaMensual;
  const maximoMensual = umaMensual * (porcentaje / 100);
  return redondearFiscal(Math.min(maximoMensual * factor, maximoMensual));
}

export function obtenerPorcentajeCesantiaPatronal(
  ejercicio: number,
  sbcDiario: number,
  zonaSalarioMinimo: 'GENERAL' | 'FRONTERA_NORTE' = 'GENERAL',
): number {
  const tarifas = obtenerTarifas(ejercicio);
  const salarioMinimo =
    zonaSalarioMinimo === 'FRONTERA_NORTE'
      ? tarifas.salarioMinimoFronteraNorte ?? tarifas.salarioMinimoGeneral
      : tarifas.salarioMinimoGeneral;

  if (sbcDiario <= salarioMinimo) return 3.15;

  const vecesUma = sbcDiario / tarifas.umaDiaria;
  const renglon = tarifas.cesantiaVejezPatronal.find(
    (r) => !r.usaSalarioMinimo && vecesUma >= r.desdeUma && vecesUma <= r.hastaUma,
  );
  return renglon?.porcentaje ?? tarifas.cesantiaVejezPatronal[tarifas.cesantiaVejezPatronal.length - 1]!.porcentaje;
}
