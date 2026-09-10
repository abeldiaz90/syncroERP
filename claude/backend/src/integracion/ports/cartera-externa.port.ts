/**
 * Puerto del registro externo de cartera.
 *
 * Es el único contrato que el ERP conoce. Todo lo que sabe de préstamos,
 * amortización y saldos pasa por aquí; el proveedor concreto —hoy Apache
 * Fineract, corriendo como servicio aparte— vive detrás.
 *
 * El vocabulario es del negocio, no del proveedor: aquí no hay `loanId`,
 * `officeId` ni `externalId`. Los identificadores externos son cadenas opacas
 * que el ERP guarda pero no interpreta.
 */

export interface ClienteExterno {
  empresaId: string;
  clienteId: string;
  nombre: string;
  esPersonaMoral: boolean;
  rfc?: string | null;
  email?: string | null;
  telefono?: string | null;
  fechaAlta?: Date | string | null;
}

export interface OriginarCreditoExterno {
  empresaId: string;
  creditoId: string;
  clienteId: string;
  /** Identificador del cliente en el registro externo. */
  clienteIdExterno: string;
  capital: number;
  numeroCuotas: number;
  tasaInteresMensual: number;
  sinInteres: boolean;
  fechaInicio: string;
  /**
   * Producto de crédito del ERP con el que se vendió. Es lo que resuelve el
   * producto del externo, vía el vínculo PRODUCTO_CREDITO.
   */
  productoCreditoId?: string | null;
  /**
   * Periodo entre cuotas, tomado del producto del ERP. El adaptador NO lee el
   * catálogo: recibe el plazo ya resuelto. Si falta, cae al respaldo por
   * `tipoCredito`.
   */
  unidadPlazo?: 'DIAS' | 'MESES';
  cadaCuantos?: number;
  /**
   * Clasificación heredada del `enum` anterior. Se conserva como respaldo para
   * los créditos emitidos antes del catálogo y para las empresas que todavía
   * tienen sus ids de producto capturados en `parametrosProveedor`.
   */
  tipoCredito: string;
  folio: string;
}


/**
 * Producto de crédito tal como lo ve el registro externo.
 *
 * Es deliberadamente el mismo vocabulario que la fila del ERP: si el externo
 * expresa el plazo de otra forma, traducirlo es trabajo del adaptador. El
 * núcleo compara manzanas con manzanas o no compara nada.
 */
export interface ProductoCreditoExterno {
  idExterno: string;
  codigo?: string | null;
  nombre: string;
  unidadPlazo: 'DIAS' | 'MESES';
  cadaCuantos: number;
  cuotasMinimas: number;
  cuotasMaximas: number;
  sinInteres: boolean;
  tasaInteresMensual: number;
  moneda: string;
}

export interface CrearProductoCreditoExterno {
  empresaId: string;
  /** UUID del producto en el ERP. Es la llave de idempotencia del alta. */
  productoId: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  unidadPlazo: 'DIAS' | 'MESES';
  cadaCuantos: number;
  cuotasMinimas: number;
  cuotasMaximas: number;
  sinInteres: boolean;
  tasaInteresMensual: number;
  moneda: string;
}

/** Una cuota de una tabla de amortización proyectada. */
export interface CuotaProyectada {
  numeroCuota: number;
  /** Fecha en formato ISO corto (yyyy-mm-dd), sin zona horaria. */
  fechaVencimiento: string;
  montoCapital: number;
  montoInteres: number;
  montoCuota: number;
}

export interface ProyectarAmortizacionExterna {
  empresaId: string;
  productoIdExterno: string;
  capital: number;
  numeroCuotas: number;
  fechaInicio: string;
  /**
   * Cliente contra el que se proyecta. Algunos proveedores exigen uno aunque no
   * se cree nada. Cualquiera sirve: lo que se compara es la forma de la tabla,
   * no de quién es.
   */
  clienteIdExterno?: string | null;
}

export interface RegistrarPagoExterno {
  empresaId: string;
  creditoId: string;
  /** Identificador del crédito en el registro externo. */
  creditoIdExterno: string;
  pagoId: string;
  monto: number;
  fechaPago: string;
  referencia?: string | null;
}

export interface CancelarCreditoExterno {
  empresaId: string;
  creditoId: string;
  creditoIdExterno: string;
  fecha: string;
  motivo?: string | null;
}

/**
 * Devolución de mercancía que reduce el saldo del crédito.
 *
 * NO es un pago: el cliente no entregó dinero. Se distingue porque un pago
 * cuenta como cumplimiento y una devolución no, y confundirlos ensucia el
 * historial crediticio de quien devolvió una caja.
 */
export interface AjusteDevolucionExterno {
  empresaId: string;
  creditoId: string;
  creditoIdExterno: string;
  /** Id de la devolución en el ERP. Es la clave de idempotencia. */
  devolucionId: string;
  monto: number;
  fecha: string;
  folio?: string | null;
}

export interface RevertirPagoExterno {
  empresaId: string;
  creditoIdExterno: string;
  pagoId: string;
  /** Identificador del pago en el registro externo, si se conoce. */
  pagoIdExterno?: string | null;
  fecha: string;
  motivo?: string | null;
}

/** Lo que el registro externo dice de un crédito concreto. */
export interface SaldoCreditoExterno {
  idExterno: string;
  /** Saldo vivo total. */
  saldoTotal: number;
  saldoVencido: number;
  /** Código de estado del proveedor, sin interpretar. */
  estado: string;
  activo: boolean;
}

export interface ResumenCarteraCliente {
  saldoTotal: number;
  saldoVencido: number;
  creditosActivos: number;
  /** Días de atraso del crédito más atrasado. */
  diasAtrasoMaximo: number;
}

export interface EstadoEnlaceExterno {
  proveedor: string;
  configurado: boolean;
  disponible: boolean;
  detalle: Record<string, unknown>;
}

/**
 * Error del registro externo, en términos que el despachador entiende. Lo
 * comparten el puerto de cartera y el de contabilidad.
 *
 * `reintentable` es la distinción que importa: un dato mal formado no mejora
 * por reintentarse, una caída del servicio sí.
 */
export class ErrorIntegracionExterna extends Error {
  constructor(
    message: string,
    readonly reintentable: boolean,
    readonly detalle?: unknown,
    /**
     * Si NO se puede descartar que el proveedor haya aplicado la operación.
     *
     * Por omisión es `true`, que es la postura prudente: ante la duda se
     * asume que pudo aplicarse. Sólo los fallos que prueban que la petición
     * nunca salió —conexión rechazada, DNS, circuito abierto— lo ponen en
     * falso, y eso es lo que permite reintentar sin riesgo una operación que
     * no admite clave de idempotencia.
     */
    readonly pudoAplicarse: boolean = true,
  ) {
    super(message);
    this.name = 'ErrorIntegracionExterna';
  }
}

export interface PuertoCarteraExterna {
  /** Nombre del proveedor, para diagnóstico y bitácora. */
  readonly proveedor: string;

  estado(): EstadoEnlaceExterno;

  /** Hay a dónde llamar y con qué autenticarse. */
  configurado(): boolean;

  /** El enlace responde ahora mismo (cortacircuitos cerrado). */
  disponible(): boolean;

  /** Crea el cliente si no existe. Idempotente. Devuelve su id externo. */
  asegurarCliente(cliente: ClienteExterno): Promise<string>;

  /** Origina y desembolsa el crédito. Idempotente. Devuelve su id externo. */
  originarCredito(input: OriginarCreditoExterno): Promise<string>;

  /** Aplica un pago. Idempotente. Null si el proveedor ya lo tenía aplicado. */
  registrarPago(input: RegistrarPagoExterno): Promise<string | null>;

  /**
   * Cancela el crédito porque la venta se anuló.
   *
   * Idempotente: si el crédito ya está cancelado allá, no falla. Devuelve
   * false cuando el proveedor no puede cancelarlo —típicamente porque ya tiene
   * movimientos— para que el hecho se resuelva a mano en vez de a medias.
   */
  cancelarCredito(input: CancelarCreditoExterno): Promise<boolean>;

  /** Aplica la reducción de saldo por devolución. Idempotente. */
  registrarDevolucion(input: AjusteDevolucionExterno): Promise<string | null>;

  /** Deshace un pago aplicado. Idempotente. */
  revertirPago(input: RevertirPagoExterno): Promise<boolean>;

  /**
   * Saldo de UN crédito en el registro externo.
   *
   * Existe aparte del resumen del cliente porque conciliar por cliente puede
   * tapar dos errores que se cancelan entre créditos: uno de más en un
   * préstamo y uno de menos en otro suman cero y el total cuadra. La
   * conciliación seria se hace crédito por crédito.
   */
  saldoCredito(idExterno: string): Promise<SaldoCreditoExterno | null>;

  /** Exposición consolidada del cliente. Es lo que consulta el POS. */
  resumenCliente(
    clienteIdExterno: string,
    timeoutMs?: number,
  ): Promise<ResumenCarteraCliente>;

  // ── Catálogo de productos ────────────────────────────────────────────────
  //
  // El catálogo comercial vive en el ERP —hay empresas que no tienen registro
  // externo y deben poder venderlo igual—. Lo que hacen estos tres métodos es
  // sostener la correspondencia cuando SÍ lo hay: crear el equivalente allá,
  // leer lo que allá ya existe, y comprobar que los dos calculan la misma
  // tabla antes de dejar vender.

  /** Crea el producto equivalente. Idempotente por `productoId`. */
  crearProductoCredito(
    input: CrearProductoCreditoExterno,
  ): Promise<ProductoCreditoExterno>;

  /** Catálogo del externo, para detectar lo que existe allá y aquí no. */
  listarProductosCredito(empresaId: string): Promise<ProductoCreditoExterno[]>;

  /**
   * Tabla de amortización que el externo calcularía, SIN crear nada.
   *
   * Es la única forma honesta de saber si los dos sistemas coinciden. Comparar
   * definiciones de producto no basta: los importes cuadraban mientras las
   * fechas de vencimiento estaban equivocadas.
   */
  proyectarAmortizacion(
    input: ProyectarAmortizacionExterna,
  ): Promise<CuotaProyectada[]>;
}

/**
 * Implementación por omisión cuando no hay proveedor configurado.
 * Falla en cerrado: nada se publica y nada se consulta.
 */
export class CarteraExternaNoConfigurada implements PuertoCarteraExterna {
  readonly proveedor = 'ninguno';

  estado(): EstadoEnlaceExterno {
    return {
      proveedor: this.proveedor,
      configurado: false,
      disponible: false,
      detalle: {},
    };
  }

  configurado(): boolean {
    return false;
  }

  disponible(): boolean {
    return false;
  }

  private negar(): never {
    throw new ErrorIntegracionExterna(
      'No hay un registro externo de cartera configurado.',
      false,
    );
  }

  async asegurarCliente(): Promise<string> {
    this.negar();
  }
  async originarCredito(): Promise<string> {
    this.negar();
  }
  async registrarPago(): Promise<string | null> {
    this.negar();
  }
  async cancelarCredito(): Promise<boolean> {
    this.negar();
  }
  async registrarDevolucion(): Promise<string | null> {
    this.negar();
  }
  async revertirPago(): Promise<boolean> {
    this.negar();
  }
  async saldoCredito(): Promise<SaldoCreditoExterno | null> {
    // Sin proveedor no hay nada que conciliar. Se niega en vez de devolver
    // null, que la conciliación leería como «el crédito no existe allá».
    this.negar();
  }

  async resumenCliente(): Promise<ResumenCarteraCliente> {
    this.negar();
  }
  async crearProductoCredito(): Promise<ProductoCreditoExterno> {
    this.negar();
  }
  async listarProductosCredito(): Promise<ProductoCreditoExterno[]> {
    this.negar();
  }
  async proyectarAmortizacion(): Promise<CuotaProyectada[]> {
    this.negar();
  }
}
