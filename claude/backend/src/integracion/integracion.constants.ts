/**
 * ============================================================================
 * SyncroERP · Integración con un registro financiero externo
 * ----------------------------------------------------------------------------
 * Este módulo NO conoce a ningún proveedor. Habla de créditos, pagos, líneas
 * autorizadas y pólizas; quién lleva el registro de esos hechos es un adaptador
 * intercambiable que vive en `adaptadores/`.
 *
 * Hay DOS ejes independientes, y una empresa puede tener uno sin el otro:
 *
 *   · `ModoCartera`       — cuánta autoridad tiene el externo sobre el crédito.
 *   · `ModoContabilidad`  — si las pólizas del ERP se espejan al externo.
 *
 * Las empresas que no contrataron el registro externo quedan en APAGADO en
 * ambos ejes y operan exactamente como siempre: nada de esto se les aplica.
 *
 * Hoy ese adaptador es Apache Fineract, que corre como servicio aparte con su
 * propia base de datos. Si mañana es otro, se escribe otro adaptador y el
 * núcleo del ERP no se entera.
 *
 * Ver INTEGRACION-FINERACT.md.
 * ============================================================================
 */

/** Grado de autoridad que se concede al registro externo, por empresa. */
export enum ModoCartera {
  /** La integración está apagada. El ERP se comporta exactamente como hoy. */
  APAGADO = 'APAGADO',
  /**
   * Se replican los hechos al registro externo y se concilian a diario, pero
   * las decisiones (disponible, bloqueo, saldo) las sigue tomando el ERP. Es el
   * modo con el que se entra a producción: construye historial y confianza sin
   * poner la caja en manos de un sistema que aún no se ha validado.
   */
  SOMBRA = 'SOMBRA',
  /**
   * El registro externo manda: el disponible y el saldo del cliente se leen de
   * ahí y las tablas del ERP quedan como proyección de consulta.
   */
  AUTORIDAD = 'AUTORIDAD',
}

/** Qué entidad del ERP representa un identificador del registro externo. */
export enum TipoVinculo {
  CLIENTE = 'CLIENTE',
  PROVEEDOR = 'PROVEEDOR',
  CREDITO = 'CREDITO',
  PAGO_COBRANZA = 'PAGO_COBRANZA',
  PRODUCTO_CREDITO = 'PRODUCTO_CREDITO',
  OFICINA = 'OFICINA',
  /** Ajuste de crédito por una devolución registrada en el externo. */
  AJUSTE_DEVOLUCION_EXTERNA = 'AJUSTE_DEVOLUCION_EXTERNA',
  /** Póliza del ERP ↔ asiento del mayor externo. */
  POLIZA = 'POLIZA',
  /** Cuenta contable del ERP ↔ cuenta del mayor externo. */
  CUENTA_CONTABLE = 'CUENTA_CONTABLE',
  /** Operador del ERP ↔ usuario del registro externo. */
  USUARIO = 'USUARIO',
}

/**
 * Grado de espejo contable.
 *
 * El ERP es SIEMPRE quien decide el cargo y el abono: su motor contable conoce
 * el IVA, el catálogo SAT y el CFDI, y el externo no. Lo que se replica es el
 * asiento ya calculado, no la decisión de calcularlo.
 *
 * De ahí que no exista un modo «AUTORIDAD» para contabilidad: dos motores
 * calculando el mismo asiento es la forma garantizada de que los libros
 * difieran.
 */
export enum ModoContabilidad {
  /** Nada se replica. La contabilidad vive sólo en el ERP. */
  APAGADO = 'APAGADO',
  /**
   * Cada póliza del ERP se replica al externo como asiento manual. El externo
   * queda con el mayor completo —el libro principal, consolidable— y el ERP
   * conserva el libro fiscal mexicano. Como los dos nacen del mismo asiento,
   * no pueden divergir estructuralmente.
   */
  ESPEJO = 'ESPEJO',
}

/** Hechos económicos que el ERP publica. Vocabulario del negocio, no del proveedor. */
export enum TipoEventoIntegracion {
  CLIENTE_ALTA = 'CLIENTE_ALTA',
  CLIENTE_ACTUALIZACION = 'CLIENTE_ACTUALIZACION',
  LINEA_AUTORIZADA = 'LINEA_AUTORIZADA',
  LINEA_REVOCADA = 'LINEA_REVOCADA',
  CREDITO_ORIGINADO = 'CREDITO_ORIGINADO',
  CREDITO_DESEMBOLSADO = 'CREDITO_DESEMBOLSADO',
  PAGO_REGISTRADO = 'PAGO_REGISTRADO',
  PAGO_REVERTIDO = 'PAGO_REVERTIDO',
  CREDITO_CANCELADO = 'CREDITO_CANCELADO',
  AJUSTE_DEVOLUCION = 'AJUSTE_DEVOLUCION',
  /** Póliza contable del ERP, para espejo en el mayor externo. */
  POLIZA_REGISTRADA = 'POLIZA_REGISTRADA',
}

export enum EstadoEventoIntegracion {
  PENDIENTE = 'PENDIENTE',
  ENVIADO = 'ENVIADO',
  /** Falló de forma recuperable; el despachador volverá a intentarlo. */
  REINTENTABLE = 'REINTENTABLE',
  /** Falló de forma definitiva. Requiere intervención humana. */
  FALLIDO = 'FALLIDO',
  /** Descartado a mano por un operador tras resolverlo por otra vía. */
  DESCARTADO = 'DESCARTADO',
}

/** Origen de la respuesta que el POS usó para autorizar una venta a crédito. */
export enum OrigenDisponibilidad {
  /** Registro externo de cartera, en línea. */
  EXTERNO = 'EXTERNO',
  ERP = 'ERP',
  /** El registro externo no respondió y se resolvió con el último valor conocido. */
  CACHE_DEGRADADO = 'CACHE_DEGRADADO',
}

export const PUERTO_VALIDACION_IDENTIDAD = Symbol('PUERTO_VALIDACION_IDENTIDAD');
export const PUERTO_BURO_CREDITO = Symbol('PUERTO_BURO_CREDITO');
/** Registro externo de cartera. Hoy lo implementa el adaptador de Fineract. */
export const PUERTO_CARTERA_EXTERNA = Symbol('PUERTO_CARTERA_EXTERNA');
/** Mayor contable externo. Hoy lo implementa el adaptador de Fineract. */
export const PUERTO_CONTABILIDAD_EXTERNA = Symbol('PUERTO_CONTABILIDAD_EXTERNA');
/** Usuarios y roles del registro externo. */
export const PUERTO_USUARIOS_EXTERNOS = Symbol('PUERTO_USUARIOS_EXTERNOS');

/**
 * Clasificación de las transacciones que devuelve el registro externo.
 *
 * Vive aquí, y no dentro de cada servicio, porque la usan dos: el que detecta
 * las transacciones nacidas fuera y el que las refleja. Duplicarlas garantiza
 * que un día se separen, y esa divergencia tiene una forma muy fea: el
 * detector denuncia algo que el aplicador no sabe aplicar, y el hallazgo se
 * repite para siempre sin que nadie entienda por qué.
 */

/**
 * Dinero que ENTRA de parte del cliente. Es lo único que el ERP puede
 * reflejar como cobranza.
 */
export const TIPOS_COBRANZA_DEL_CLIENTE = [
  'repayment',
  'downpayment',
  'recoveryrepayment',
];

/**
 * Movimientos que bajan el saldo SIN que entre dinero: devoluciones al
 * cliente, bonificaciones de cortesía.
 *
 * Están separados porque reflejarlos como cobranza sería un error caro y
 * silencioso: el ERP registraría un cobro, movería tesorería y cargaría la
 * caja por un dinero que nunca entró. El arqueo saldría descuadrado y el
 * asiento diría que la caja recibió algo que no recibió.
 *
 * Su reflejo correcto es otra operación del ERP —una devolución, que necesita
 * la venta de origen—, y esa pieza todavía no existe. Hasta que exista se
 * detectan y se reportan, pero no se aplican.
 */
export const TIPOS_REDUCCION_SIN_COBRO = [
  'merchantissuedrefund',
  'payoutrefund',
  'goodwillcredit',
];

/** Todo lo que representa un movimiento real sobre el crédito. */
export const TIPOS_TRANSACCION_REFLEJABLES = [
  ...TIPOS_COBRANZA_DEL_CLIENTE,
  ...TIPOS_REDUCCION_SIN_COBRO,
];

/**
 * Transacciones que genera el propio externo y no son movimientos de nadie:
 * el desembolso que abre el préstamo, los devengos, las reprogramaciones.
 *
 * Ninguna lleva referencia del ERP, porque el ERP no las creó. Sin esta lista
 * el desembolso de CADA crédito se reportaría como operación externa.
 */
export const TIPOS_TRANSACCION_PROPIOS_DEL_CORE = [
  'disbursement',
  'accrual',
  'accrualactivity',
  'accrualadjustment',
  'incomeposting',
  'reage',
  'reamortize',
];

/** Normaliza `loanTransactionType.repayment` a `repayment`. */
export function tipoTransaccionNormalizado(tipo: string): string {
  return tipo.split('.').pop()?.toLowerCase() ?? '';
}

/** Prefijo con el que el ERP marca todo lo que origina en el externo. */
export const PREFIJO_REFERENCIA_ERP = 'syncro:';
