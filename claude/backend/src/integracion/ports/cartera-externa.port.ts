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
  /**
   * Identificador del cliente en el registro externo, cuando el ERP ya lo
   * conoce por su tabla de vínculos.
   *
   * Existe porque buscar al cliente por su `externalId` no siempre lo
   * encuentra: un cliente dado de alta a mano en el core, o replicado antes de
   * que existiera la convención de referencias, no lo tiene. El vínculo que el
   * ERP guardó al replicarlo sí es fiable, así que se prefiere y la búsqueda
   * queda como respaldo.
   */
  idExterno?: string | null;

  /** CURP, cuando el expediente la tiene. Viaja como identificador tipado. */
  curp?: string | null;

  /** `aaaa-mm-dd`. El core la modela desde siempre; el ERP la ganó después. */
  fechaNacimiento?: string | null;

  /** Se resuelve contra el catálogo `Gender` del core, por nombre. */
  genero?: 'FEMENINO' | 'MASCULINO' | 'NO_ESPECIFICADO' | null;

  /**
   * Documentos del expediente: INE, pasaporte, comprobante de domicilio.
   * Van con la etiqueta que usa el catálogo del core, no con el enum del ERP:
   * traducir aquí evita que el adaptador conozca el vocabulario interno.
   */
  identificaciones?: Array<{ etiqueta: string; folio: string }> | null;

  /**
   * Domicilio del cliente, tal como lo captura el ERP.
   *
   * Viaja aparte del alta porque en Fineract el domicilio no es un campo del
   * cliente sino un recurso propio, con su tipo y su catálogo de país y estado.
   * Se manda completo o no se manda: medio domicilio en un core de cartera es
   * peor que ninguno, porque una visita de cobranza sale igual.
   */
  domicilio?: {
    calle?: string | null;
    colonia?: string | null;
    ciudad?: string | null;
    estado?: string | null;
    codigoPostal?: string | null;
    pais?: string | null;
  } | null;
}

export interface ResultadoExpediente {
  aplicados: string[];
  omitidos: string[];
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

/**
 * Una transacción de un crédito, tal como la ve el registro externo.
 *
 * `referenciaErp` es la clave de todo el sentido externo → ERP: el ERP marca
 * con su propia referencia cada transacción que origina, así que una
 * transacción sin referencia conocida nació fuera del ERP. Distinguirlo así es
 * exacto; hacerlo comparando importes y fechas es donde estas integraciones se
 * vuelven frágiles en cuanto dos relojes se separan.
 */
export interface TransaccionCreditoExterna {
  /** Identificador de la transacción en el proveedor. */
  idExterno: string;
  /** Referencia que puso el ERP al originarla. Null si no la originó el ERP. */
  referenciaErp: string | null;
  /** Código del proveedor sin interpretar: REPAYMENT, MERCHANT_ISSUED_REFUND… */
  tipo: string;
  monto: number;
  /** AAAA-MM-DD. */
  fecha: string;
  /** Ya reversada en el externo. */
  reversada: boolean;
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

/**
 * ============================================================================
 * «Esto no se manda nunca, y está bien» no es un fallo
 * ----------------------------------------------------------------------------
 * Hay eventos del outbox que, al despacharse, resultan no tener destino por
 * diseño. El caso que lo destapó: una póliza CANCELADA no se espeja, porque su
 * reversa viaja como póliza propia con su propio evento.
 *
 * Eso se lanzaba como `ErrorIntegracionExterna` no reintentable, así que el
 * evento quedaba en FALLIDO. Y FALLIDO significa «alguien tiene que ir a
 * mirarlo»: enciende la pantalla de administración y —desde el 25-sep-2026—
 * BLOQUEA EL CIERRE DEL MES con el control del espejo contable.
 *
 * Es decir: cancelar una póliza, que es una operación contable normalísima,
 * dejaba un bloqueo permanente en el cierre que nadie podía resolver, porque no
 * había nada que resolver. Medido esa misma madrugada con la póliza de prueba
 * DI-2026-00018.
 *
 * Un evento sin destino se marca DESCARTADO con su razón escrita: no se
 * reintenta, no cuenta como divergencia, y queda la constancia de por qué.
 * ============================================================================
 */
export class EventoSinDestino extends ErrorIntegracionExterna {
  constructor(message: string) {
    // No reintentable y sin posibilidad de haberse aplicado: no salió nada.
    super(message, false, undefined, false);
    this.name = 'EventoSinDestino';
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

  /**
   * Lleva al registro externo un cambio de los datos de identidad del cliente.
   *
   * `asegurarCliente` es idempotente por diseño: si encuentra al cliente por su
   * referencia, devuelve su identificador y no toca nada. Eso es correcto para
   * un alta, y es justo lo que hacía que una corrección de nombre no llegara
   * nunca: el ERP decía «Jorge Alberto Cantú» y el core seguía mostrando el
   * nombre con el que nació. Los dos sistemas se separaban en el campo que más
   * se mira, y sin dejar rastro de la divergencia.
   *
   * Devuelve el identificador externo, o `null` si el cliente todavía no está
   * replicado —en cuyo caso no hay nada que actualizar y tampoco es un error—.
   */
  actualizarCliente(cliente: ClienteExterno): Promise<string | null>;

  /**
   * Lleva al registro externo lo que no cabe en la ficha del cliente:
   * identificadores oficiales (RFC, CURP) y domicilio.
   *
   * Existe como operación aparte porque en Fineract son recursos distintos,
   * cada uno con su catálogo y su permiso. Devuelve lo que sí pudo escribir y
   * lo que no, en vez de fallar entero: que falte el catálogo de un tipo de
   * documento no es razón para dejar al cliente sin domicilio.
   */
  sincronizarExpediente(cliente: ClienteExterno): Promise<ResultadoExpediente>;

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

  /**
   * Transacciones de UN crédito, con la referencia que el ERP les puso.
   *
   * Es la pieza que hace posible el sentido externo → ERP. Sin ella sólo se
   * puede ver el saldo resultante, que dice que algo cambió pero no qué, y
   * con eso no se puede reflejar una operación en el ERP.
   *
   * Devuelve null si el crédito ya no existe allá, con el mismo criterio que
   * `saldoCredito`: eso es un hallazgo de conciliación, no un fallo de red.
   */
  transaccionesCredito(
    idExterno: string,
  ): Promise<TransaccionCreditoExterna[] | null>;

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
  /** Fecha mínima del cliente para una proyección, si el proveedor la exige. */
  fechaMinimaProyeccion?(clienteIdExterno: string): Promise<string | null>;

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

  async sincronizarExpediente(): Promise<ResultadoExpediente> {
    return { aplicados: [], omitidos: ['La integración no está configurada.'] };
  }

  async actualizarCliente(): Promise<string | null> {
    return null;
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
  async transaccionesCredito(): Promise<TransaccionCreditoExterna[] | null> {
    // Mismo criterio que `saldoCredito`: sin proveedor se niega, porque un
    // arreglo vacío se leería como «ese crédito no tiene movimientos allá».
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
