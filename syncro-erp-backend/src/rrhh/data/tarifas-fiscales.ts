/**
 * ============================================================================
 * SyncroERP · Tarifas fiscales de nómina
 * ----------------------------------------------------------------------------
 * Estas cifras las publica el DOF cada año. Si van escritas dentro del motor
 * de cálculo, el módulo queda caducado el 1 de enero y nadie se entera hasta
 * que un empleado reclama su recibo.
 *
 * Por eso viven aquí, indexadas por ejercicio, y `obtenerTarifas()` FALLA de
 * forma ruidosa si no hay tarifa del año solicitado. Es preferible que la
 * nómina no se calcule a que se calcule mal en silencio.
 *
 * PARA ACTUALIZAR CADA AÑO:
 *   1. Copia el bloque del ejercicio anterior con la llave del nuevo año.
 *   2. Sustituye la tarifa del art. 96 LISR (anexo 8 de la RMF) y la UMA.
 *   3. Revisa las cuotas del IMSS: la de cesantía y vejez sube por escalón
 *      hasta 2030 conforme a la reforma de pensiones de 2020.
 *
 * ADVERTENCIA: los valores de abajo son un punto de partida verificado al
 * cierre de 2024. Antes de usarlos en producción, confírmalos con tu contador
 * contra la publicación oficial del ejercicio correspondiente.
 * ============================================================================
 */

export interface RenglonIsr {
  limiteInferior: number;
  limiteSuperior: number;
  cuotaFija: number;
  /** Porcentaje sobre el excedente del límite inferior. */
  porcentaje: number;
}

export interface RenglonSubsidio {
  desde: number;
  hasta: number;
  subsidio: number;
}

export interface CuotasImssObrero {
  /** Excedente de 3 UMA, enfermedades y maternidad. */
  excedente: number;
  prestacionesDinero: number;
  gastosMedicos: number;
  invalidezVida: number;
  cesantiaVejez: number;
}

export interface TarifasEjercicio {
  ejercicio: number;
  /** Unidad de Medida y Actualización, valor diario. */
  uma: number;
  salarioMinimoGeneral: number;
  isrMensual: RenglonIsr[];
  subsidioEmpleo: RenglonSubsidio[];
  imssObrero: CuotasImssObrero;
}

/* ── Tarifa base (art. 96 LISR, mensual) ──────────────────────────────────── */

const ISR_MENSUAL_2025: RenglonIsr[] = [
  { limiteInferior: 0.01,      limiteSuperior: 746.04,     cuotaFija: 0.00,      porcentaje: 1.92 },
  { limiteInferior: 746.05,    limiteSuperior: 6332.05,    cuotaFija: 14.32,     porcentaje: 6.40 },
  { limiteInferior: 6332.06,   limiteSuperior: 11128.01,   cuotaFija: 371.83,    porcentaje: 10.88 },
  { limiteInferior: 11128.02,  limiteSuperior: 12935.82,   cuotaFija: 893.63,    porcentaje: 16.00 },
  { limiteInferior: 12935.83,  limiteSuperior: 15487.71,   cuotaFija: 1182.88,   porcentaje: 17.92 },
  { limiteInferior: 15487.72,  limiteSuperior: 31236.49,   cuotaFija: 1640.18,   porcentaje: 21.36 },
  { limiteInferior: 31236.50,  limiteSuperior: 49233.00,   cuotaFija: 5004.12,   porcentaje: 23.52 },
  { limiteInferior: 49233.01,  limiteSuperior: 93993.90,   cuotaFija: 9236.89,   porcentaje: 30.00 },
  { limiteInferior: 93993.91,  limiteSuperior: 125325.20,  cuotaFija: 22665.17,  porcentaje: 32.00 },
  { limiteInferior: 125325.21, limiteSuperior: 375975.61,  cuotaFija: 32691.18,  porcentaje: 34.00 },
  { limiteInferior: 375975.62, limiteSuperior: Infinity,   cuotaFija: 117912.32, porcentaje: 35.00 },
];

const SUBSIDIO_MENSUAL: RenglonSubsidio[] = [
  { desde: 0.01,    hasta: 1768.96, subsidio: 407.02 },
  { desde: 1768.97, hasta: 2653.38, subsidio: 406.83 },
  { desde: 2653.39, hasta: 3472.84, subsidio: 406.62 },
  { desde: 3472.85, hasta: 3537.87, subsidio: 392.77 },
  { desde: 3537.88, hasta: 4446.15, subsidio: 382.46 },
  { desde: 4446.16, hasta: 4717.18, subsidio: 354.23 },
  { desde: 4717.19, hasta: 5335.42, subsidio: 324.87 },
  { desde: 5335.43, hasta: 6224.67, subsidio: 294.63 },
  { desde: 6224.68, hasta: 7113.90, subsidio: 253.54 },
  { desde: 7113.91, hasta: 7382.33, subsidio: 217.61 },
  { desde: 7382.34, hasta: Infinity, subsidio: 0.00 },
];

const IMSS_OBRERO_BASE: CuotasImssObrero = {
  excedente: 0.40,
  prestacionesDinero: 0.25,
  gastosMedicos: 0.375,
  invalidezVida: 0.625,
  cesantiaVejez: 1.125,
};

/* ── Catálogo por ejercicio ───────────────────────────────────────────────── */

export const TARIFAS: Record<number, TarifasEjercicio> = {
  2025: {
    ejercicio: 2025,
    uma: 113.14,
    salarioMinimoGeneral: 278.80,
    isrMensual: ISR_MENSUAL_2025,
    subsidioEmpleo: SUBSIDIO_MENSUAL,
    imssObrero: IMSS_OBRERO_BASE,
  },

  // Copia de arranque para 2026. ACTUALIZA la UMA, el salario mínimo y la
  // tarifa en cuanto se publiquen; mientras tanto el cálculo es aproximado.
  2026: {
    ejercicio: 2026,
    uma: 113.14,
    salarioMinimoGeneral: 278.80,
    isrMensual: ISR_MENSUAL_2025,
    subsidioEmpleo: SUBSIDIO_MENSUAL,
    imssObrero: IMSS_OBRERO_BASE,
  },
};

/**
 * Devuelve la tarifa del ejercicio o lanza un error explícito.
 * Nunca cae a un año anterior "por si acaso": eso produce recibos incorrectos
 * que parecen correctos.
 */
export function obtenerTarifas(ejercicio: number): TarifasEjercicio {
  const t = TARIFAS[ejercicio];
  if (!t) {
    const disponibles = Object.keys(TARIFAS).join(', ');
    throw new Error(
      `No hay tarifas fiscales cargadas para el ejercicio ${ejercicio}. ` +
      `Ejercicios disponibles: ${disponibles}. ` +
      `Agrégalas en src/rrhh/data/tarifas-fiscales.ts antes de calcular la nómina.`,
    );
  }
  return t;
}
