/**
 * ============================================================================
 * SyncroERP · Flujos de validación previos al crédito
 * ----------------------------------------------------------------------------
 * Cada empresa arma su propia secuencia: identidad con INE, buró, círculo de
 * crédito, historial interno, revisión humana. El motor la ejecuta en orden y
 * produce un veredicto.
 *
 * Los proveedores todavía no existen —llegan cuando se migren los componentes
 * de la suite de SUMA al ERP—. Por eso cada paso se resuelve contra un puerto,
 * y un puerto sin proveedor devuelve NO_DISPONIBLE en vez de aprobar. Lo que se
 * puede diseñar y probar hoy es el flujo; lo que se enchufa después es el
 * proveedor.
 * ============================================================================
 */

/** Qué comprueba un paso. */
export enum TipoPasoValidacion {
  /** Identidad contra INE/RENAPO, con o sin prueba de vida. */
  IDENTIDAD_INE = 'IDENTIDAD_INE',
  /** Buró de Crédito. Exige autorización firmada del titular. */
  BURO_CREDITO = 'BURO_CREDITO',
  /** Círculo de Crédito. Misma exigencia legal. */
  CIRCULO_CREDITO = 'CIRCULO_CREDITO',
  /** Comportamiento del cliente en la cartera propia. */
  HISTORIAL_INTERNO = 'HISTORIAL_INTERNO',
  /** Listas de bloqueo internas o de terceros. */
  LISTA_BLOQUEO = 'LISTA_BLOQUEO',
  /** Regla propia de la empresa sobre el monto solicitado. */
  POLITICA_INTERNA = 'POLITICA_INTERNA',
  /** Una persona debe revisar. Nunca aprueba sola. */
  REVISION_MANUAL = 'REVISION_MANUAL',
}

/** Cómo salió un paso. */
export enum ResultadoPaso {
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
  /** El proveedor respondió pero no fue concluyente. */
  INDETERMINADO = 'INDETERMINADO',
  /** No hay proveedor configurado todavía. */
  NO_DISPONIBLE = 'NO_DISPONIBLE',
  /** El paso no aplicaba según sus condiciones. */
  OMITIDO = 'OMITIDO',
  /** Falló la consulta. Distinto de que el proveedor diga que no. */
  ERROR = 'ERROR',
}

/** Qué hace el flujo cuando un paso no sale limpio. */
export enum PoliticaPaso {
  /** Si no queda APROBADO, el flujo se detiene y rechaza. */
  BLOQUEANTE = 'BLOQUEANTE',
  /** Si no queda APROBADO, manda el expediente a revisión humana. */
  DERIVA_A_REVISION = 'DERIVA_A_REVISION',
  /** Sólo suma o resta puntos. Nunca detiene el flujo. */
  INFORMATIVO = 'INFORMATIVO',
}

export enum EstadoEjecucion {
  EN_PROCESO = 'EN_PROCESO',
  APROBADA = 'APROBADA',
  APROBADA_CON_AJUSTE = 'APROBADA_CON_AJUSTE',
  RECHAZADA = 'RECHAZADA',
  REVISION_MANUAL = 'REVISION_MANUAL',
}

/** Para qué se usa un flujo. Hoy sólo hay uno; se declara para no repintar después. */
export enum PropositoFlujo {
  ORIGINACION_CREDITO = 'ORIGINACION_CREDITO',
}

export const REGISTRO_EVALUADORES = Symbol('REGISTRO_EVALUADORES');
