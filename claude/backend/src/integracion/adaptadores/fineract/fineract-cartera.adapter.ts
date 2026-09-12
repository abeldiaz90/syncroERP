import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionIntegracionEmpresa } from '../../entities/configuracion-integracion-empresa.entity';
import {
  VinculoIntegracion,
  referenciaDe,
} from '../../entities/vinculo-integracion.entity';
import { TipoVinculo } from '../../integracion.constants';
import {
  AjusteDevolucionExterno,
  CancelarCreditoExterno,
  ClienteExterno,
  CrearProductoCreditoExterno,
  CuotaProyectada,
  ErrorIntegracionExterna,
  EstadoEnlaceExterno,
  OriginarCreditoExterno,
  ProductoCreditoExterno,
  ProyectarAmortizacionExterna,
  PuertoCarteraExterna,
  RegistrarPagoExterno,
  ResumenCarteraCliente,
  SaldoCreditoExterno,
  RevertirPagoExterno,
} from '../../ports/cartera-externa.port';
import { FineractConfig } from './fineract.config';
import { ErrorFineract, FineractHttpService } from './fineract-http.service';

/** Códigos de Fineract que el adaptador necesita nombrar. */
const FRECUENCIA_DIAS = 0;
const FRECUENCIA_MESES = 2;

/**
 * Plazo en días de los créditos de una sola exhibición. El ERP los calcula
 * sumando días exactos (`fechaPorTipo`), no meses: 60 días desde el 7 de
 * septiembre es el 6 de noviembre, no el 7. Mandar «1 mes» en su lugar hacía
 * que Fineract venciera los tres el mismo día y nadie lo notaba, porque los
 * importes coincidían.
 */
const DIAS_POR_TIPO: Record<string, number> = {
  CREDITO_30D: 30,
  CREDITO_60D: 60,
  CREDITO_90D: 90,
};
const AMORTIZACION_CUOTAS_IGUALES = 1;
/** 0 = saldos insolutos (francés), que es lo que calcula CreditosService. */
const INTERES_SALDOS_INSOLUTOS = 0;
const INTERES_PLANO = 1;
const PERIODO_CALCULO_IGUAL_A_CUOTA = 1;
/** 2 = la tasa se expresa por mes, que es como la captura el ERP. */
const TASA_POR_MES = 2;
/**
 * 1 = NONE. El producto se crea SIN contabilidad propia a propósito: las
 * pólizas las manda el ERP por el espejo contable, y un producto con
 * contabilidad activa las volvería a registrar del otro lado. El mayor
 * cuadraría al doble, que es la peor forma de estar mal.
 */
const SIN_CONTABILIDAD = 1;
/**
 * 1 = días reales, tanto para el año como para el mes. Fineract los exige al
 * crear el producto aunque con `interestCalculationPeriodType` igual a la
 * cuota no cambien el cálculo: el interés del periodo sale de la tasa mensual,
 * no de contar días. Se declaran «reales» porque es lo que hace el ERP.
 */
const DIAS_REALES = 1;

/** Parámetros que esta implementación guarda en `parametrosProveedor`. */
interface ParametrosFineract {
  oficinaId?: number;
  productoCreditoSimpleId?: number;
  productoMensualidadesId?: number;
  productoMsiId?: number;
}

const CREDITOS_SIMPLES = new Set([
  'CREDITO_30D',
  'CREDITO_60D',
  'CREDITO_90D',
]);

/**
 * Adaptador de Apache Fineract.
 *
 * Es el ÚNICO archivo del ERP que conoce el vocabulario de Fineract —loans,
 * clients, officeId, externalId—. Todo lo de arriba habla de créditos, clientes
 * y pagos. Sustituir Fineract por otro proveedor es escribir otra clase que
 * implemente `PuertoCarteraExterna` y cambiar una línea en el módulo.
 *
 * Fineract corre como servicio aparte, con su propia base de datos. Aquí sólo
 * hay llamadas HTTP.
 */
@Injectable()
export class FineractCarteraAdapter implements PuertoCarteraExterna {
  readonly proveedor = 'fineract';
  private readonly logger = new Logger(FineractCarteraAdapter.name);

  constructor(
    private readonly http: FineractHttpService,
    private readonly cfg: FineractConfig,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
    @InjectRepository(VinculoIntegracion)
    private readonly vinculos: Repository<VinculoIntegracion>,
  ) {}

  /**
   * Id del bucket de morosidad, resuelto una vez por vida del proceso.
   * `undefined` = no se ha preguntado; `null` = se pregunto y no existe.
   */
  private bucketMoraId?: number | null;

  /**
   * Resuelve el bucket de morosidad por NOMBRE contra el catalogo de Fineract.
   *
   * Devuelve `null` en vez de reventar: un producto sin bucket se puede vender
   * —sale mal clasificada la mora, no mal calculado el credito— y hacer que
   * fallara la creacion del producto por esto convertiria un defecto de
   * reporteo en una caida del punto de venta.
   */
  private async idBucketMora(): Promise<number | null> {
    if (this.bucketMoraId !== undefined) return this.bucketMoraId;
    const buscado = this.cfg.bucketMoraNombre.trim().toLowerCase();
    try {
      const buckets = await this.http.get<Array<{ id?: number; name?: string }>>(
        '/v1/delinquency/buckets',
        { timeoutMs: this.cfg.timeoutFondoMs },
      );
      const hallado = (buckets ?? []).find(
        (b) => String(b.name ?? '').trim().toLowerCase() === buscado,
      );
      if (!hallado?.id) {
        this.logger.warn(
          `No existe el bucket de morosidad «${this.cfg.bucketMoraNombre}» en Fineract. ` +
            'Los productos nuevos no van a reportar dias de atraso.',
        );
      }
      this.bucketMoraId = hallado?.id ?? null;
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el catalogo de buckets de morosidad: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.bucketMoraId = null;
    }
    return this.bucketMoraId;
  }

  configurado(): boolean {
    return this.cfg.habilitado;
  }

  disponible(): boolean {
    return this.http.disponible;
  }

  estado(): EstadoEnlaceExterno {
    return {
      proveedor: this.proveedor,
      configurado: this.configurado(),
      disponible: this.disponible(),
      detalle: {
        url: this.cfg.url || null,
        tenant: this.cfg.tenant,
        autenticacion: this.cfg.tieneOAuth ? 'oauth2' : 'basica',
        circuito: this.http.estadoCircuito,
      },
    };
  }

  // ── Clientes ─────────────────────────────────────────────────────────────

  async asegurarCliente(cliente: ClienteExterno): Promise<string> {
    const referencia = referenciaDe(TipoVinculo.CLIENTE, cliente.clienteId);

    const existente = await this.buscarPorReferencia('clients', referencia);
    if (existente) return existente;

    const activacion = this.fecha(cliente.fechaAlta);
    const oficina =
      (await this.parametros(cliente.empresaId)).oficinaId ??
      this.cfg.oficinaPorDefecto;

    // legalFormId: 1 = persona física, 2 = persona moral.
    const cuerpo: Record<string, unknown> = {
      officeId: oficina,
      legalFormId: cliente.esPersonaMoral ? 2 : 1,
      externalId: referencia,
      active: true,
      activationDate: activacion,
      submittedOnDate: activacion,
      locale: this.cfg.localePorDefecto,
      dateFormat: this.cfg.formatoFecha,
    };

    if (cliente.esPersonaMoral) {
      cuerpo.fullname = cliente.nombre.slice(0, 100);
    } else {
      // Fineract exige nombre y apellido separados para persona física.
      const partes = cliente.nombre.trim().split(/\s+/);
      cuerpo.firstname = (partes.shift() ?? cliente.nombre).slice(0, 50);
      cuerpo.lastname = (partes.join(' ') || '.').slice(0, 50);
    }
    if (cliente.email) cuerpo.emailAddress = cliente.email;
    if (cliente.telefono) cuerpo.mobileNo = cliente.telefono.slice(0, 50);

    try {
      const respuesta = await this.http.post<{ clientId: number }>(
        '/v1/clients',
        cuerpo,
      );
      return String(respuesta.clientId);
    } catch (error) {
      // Carrera perdida contra otro despachador: el cliente ya existe.
      const recuperado = await this.recuperarDuplicado(
        error,
        'clients',
        referencia,
      );
      if (recuperado) return recuperado;
      throw this.traducir(error);
    }
  }

  // ── Créditos ─────────────────────────────────────────────────────────────

  /**
   * Crea, aprueba y desembolsa en un solo paso.
   *
   * En una venta a crédito de mostrador los tres momentos ocurren a la vez: la
   * mercancía sale en el instante en que se autoriza. Separarlos aquí sería
   * modelar un flujo que no existe. La originación con expediente y comité —la
   * que viene después— sí usará los tres comandos por separado.
   */
  async originarCredito(input: OriginarCreditoExterno): Promise<string> {
    const referencia = referenciaDe(TipoVinculo.CREDITO, input.creditoId);

    let prestamoId = await this.buscarPorReferencia('loans', referencia);

    if (!prestamoId) {
      try {
        prestamoId = await this.crearSolicitud(input, referencia);
      } catch (error) {
        const recuperado = await this.recuperarDuplicado(
          error,
          'loans',
          referencia,
        );
        if (!recuperado) throw this.traducir(error);
        prestamoId = recuperado;
      }
    }

    try {
      const estado = await this.estadoPrestamo(prestamoId);

      if (estado.pendienteAprobacion) {
        await this.http.post(`/v1/loans/${prestamoId}?command=approve`, {
          approvedOnDate: input.fechaInicio,
          approvedLoanAmount: input.capital,
          locale: this.cfg.localePorDefecto,
          dateFormat: this.cfg.formatoFecha,
        });
      }
      if (!estado.desembolsado) {
        await this.http.post(`/v1/loans/${prestamoId}?command=disburse`, {
          actualDisbursementDate: input.fechaInicio,
          transactionAmount: input.capital,
          locale: this.cfg.localePorDefecto,
          dateFormat: this.cfg.formatoFecha,
        });
      }
    } catch (error) {
      throw this.traducir(error);
    }

    return prestamoId;
  }

  async registrarPago(input: RegistrarPagoExterno): Promise<string | null> {
    const referencia = referenciaDe(TipoVinculo.PAGO_COBRANZA, input.pagoId);

    const cuerpo: Record<string, unknown> = {
      transactionDate: input.fechaPago,
      transactionAmount: input.monto,
      externalId: referencia,
      note: input.referencia ?? undefined,
      locale: this.cfg.localePorDefecto,
      dateFormat: this.cfg.formatoFecha,
    };

    try {
      const respuesta = await this.http.post<{ resourceId: number }>(
        `/v1/loans/${input.creditoIdExterno}/transactions?command=repayment`,
        cuerpo,
      );
      return String(respuesta.resourceId);
    } catch (error) {
      // El pago ya estaba aplicado: reintento de un despacho anterior.
      if (error instanceof ErrorFineract && error.estadoHttp === 403) {
        this.logger.warn(
          `El pago ${input.pagoId} ya existía en Fineract; se toma como aplicado.`,
        );
        return null;
      }
      throw this.traducir(error);
    }
  }

  async saldoCredito(idExterno: string): Promise<SaldoCreditoExterno | null> {
    try {
      const p = await this.http.get<{
        id?: number;
        status?: { active?: boolean; value?: string; code?: string };
        summary?: { totalOutstanding?: number; totalOverdue?: number };
      }>(`/v1/loans/${idExterno}`, { timeoutMs: this.cfg.timeoutFondoMs });

      return {
        idExterno: String(p?.id ?? idExterno),
        saldoTotal: Number(p?.summary?.totalOutstanding ?? 0),
        /*
         * `summary.totalOverdue` y no `delinquent`: en esta versión el bloque
         * `delinquent` llega nulo, y leerlo daría cero vencido para toda la
         * cartera sin que nada fallara.
         */
        saldoVencido: Number(p?.summary?.totalOverdue ?? 0),
        estado: String(p?.status?.code ?? p?.status?.value ?? ''),
        activo: p?.status?.active === true,
      };
    } catch (error) {
      /*
       * Un crédito que ya no existe allá NO es un error de comunicación: es un
       * hallazgo de conciliación. Se distingue devolviendo null para el 404 y
       * propagando lo demás, porque tratar una caída de red como «no existe»
       * inventaría discrepancias cada vez que el enlace se cae.
       */
      const fallo = error as { estado?: number; status?: number };
      if (fallo?.estado === 404 || fallo?.status === 404) return null;
      throw this.traducir(error);
    }
  }

  async resumenCliente(
    clienteIdExterno: string,
    timeoutMs?: number,
  ): Promise<ResumenCarteraCliente> {
    try {
      const respuesta = await this.http.get<{
        loanAccounts?: {
          status?: { active?: boolean };
          summary?: { totalOutstanding?: number; totalOverdue?: number };
          delinquent?: { pastDueDays?: number };
        }[];
      }>(`/v1/clients/${clienteIdExterno}/accounts`, {
        timeoutMs: timeoutMs ?? this.cfg.timeoutPosMs,
      });

      const activos = (respuesta.loanAccounts ?? []).filter(
        (p) => p.status?.active === true,
      );

      return {
        saldoTotal: activos.reduce(
          (t, p) => t + Number(p.summary?.totalOutstanding ?? 0),
          0,
        ),
        saldoVencido: activos.reduce(
          (t, p) => t + Number(p.summary?.totalOverdue ?? 0),
          0,
        ),
        creditosActivos: activos.length,
        diasAtrasoMaximo: activos.reduce(
          (m, p) => Math.max(m, Number(p.delinquent?.pastDueDays ?? 0)),
          0,
        ),
      };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  // ── Reversas ─────────────────────────────────────────────────────────────
  //
  // Deshacer es donde una integración se rompe en silencio. El ERP puede
  // cancelar un crédito o bajarle el saldo por una devolución en su propia
  // base sin que nadie se entere de que allá el préstamo sigue vivo por el
  // importe completo. Estas tres traducciones existen para que eso no pase, y
  // fallan en firme antes que aproximar: una reversa mal traducida no truena,
  // deja al cliente debiendo lo que ya devolvió.

  /**
   * Cancela el préstamo porque la venta se anuló.
   *
   * En Fineract un préstamo desembolsado no se «borra»: hay que deshacer el
   * desembolso y después retirarlo. El ERP sólo permite anular una venta a
   * crédito SIN abonos ni enganche, así que el deshacer siempre debería
   * proceder; si no procede, se dice y se detiene.
   */
  async cancelarCredito(input: CancelarCreditoExterno): Promise<boolean> {
    const id = input.creditoIdExterno;
    const nota = input.motivo ?? 'Anulación de la venta en SyncroERP';
    const formato = {
      locale: this.cfg.localePorDefecto,
      dateFormat: this.cfg.formatoFecha,
    };

    try {
      /*
       * Fineract exige recorrer el ciclo de vida HACIA ATRÁS, paso por paso:
       * un préstamo desembolsado no se puede retirar, sólo se puede retirar
       * uno «pendiente de aprobación». Así que hay que deshacer el desembolso,
       * después deshacer la aprobación, y sólo entonces retirarlo.
       *
       * Se relee el estado entre pasos en vez de encadenarlos a ciegas, y eso
       * es lo que hace la operación reanudable: si el proceso se cae a la
       * mitad, el siguiente intento continúa desde donde quedó en lugar de
       * repetir un paso que ya no aplica. La primera versión encadenaba
       * deshacer-desembolso con retirar y dejaba el préstamo aprobado-sin-
       * desembolsar, ni vivo ni cancelado, mientras el ERP lo daba por
       * cancelado.
       */
      for (let paso = 0; paso < 4; paso += 1) {
        const estado = await this.estadoPrestamo(id);

        if (estado.cancelado) return true;

        /*
         * Deshacer no lleva fecha, y por eso tampoco lleva `locale` ni
         * `dateFormat`: Fineract rechaza con «400: locale» los parámetros que
         * el comando no espera. Sólo el retiro, que sí registra una fecha, los
         * necesita. Mandar el mismo cuerpo a los tres comandos parecía
         * ordenado y dejaba el préstamo a medio deshacer.
         */
        if (estado.activo) {
          await this.http.post(`/v1/loans/${id}?command=undodisbursal`, {
            note: nota,
          });
          continue;
        }

        if (estado.aprobado) {
          await this.http.post(`/v1/loans/${id}?command=undoapproval`, {
            note: nota,
          });
          continue;
        }

        if (estado.pendienteAprobacion) {
          await this.http.post(
            `/v1/loans/${id}?command=withdrawnByApplicant`,
            { withdrawnOnDate: input.fecha, note: nota, ...formato },
          );
          return true;
        }

        // Un estado que no sabemos deshacer —cerrado, castigado, sobrepagado—.
        // Se dice cuál es en vez de intentar algo que lo empeore.
        throw new ErrorIntegracionExterna(
          `El préstamo ${id} está en un estado que el ERP no sabe cancelar (${estado.codigo}). Resuélvelo en el registro externo.`,
          false,
        );
      }

      throw new ErrorIntegracionExterna(
        `El préstamo ${id} no llegó a quedar cancelado tras recorrer su ciclo de vida. Revísalo en el registro externo.`,
        false,
      );
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Devolución de mercancía contra un crédito vivo.
   *
   * Se manda como `merchantIssuedRefund`, que es el movimiento que Fineract
   * tiene para exactamente esto: el comercio devuelve importe sobre el
   * préstamo. NO se manda como pago —aunque el efecto en el saldo sea el
   * mismo— porque un pago cuenta como cumplimiento y una devolución no, y esa
   * diferencia se ve en el historial del cliente.
   */
  async registrarDevolucion(
    input: AjusteDevolucionExterno,
  ): Promise<string | null> {
    const referencia = `syncro:devolucion:${input.devolucionId}`;
    try {
      const respuesta = await this.http.post<{ resourceId: number }>(
        `/v1/loans/${input.creditoIdExterno}/transactions?command=merchantIssuedRefund`,
        {
          transactionDate: input.fecha,
          transactionAmount: input.monto,
          externalId: referencia,
          note: `Devolución ${input.folio ?? input.devolucionId} de SyncroERP`,
          locale: this.cfg.localePorDefecto,
          dateFormat: this.cfg.formatoFecha,
        },
      );
      return String(respuesta.resourceId);
    } catch (error) {
      // Ya aplicada en un despacho anterior: la referencia choca.
      if (error instanceof ErrorFineract && error.estadoHttp === 403) {
        this.logger.warn(
          `La devolución ${input.devolucionId} ya existía en Fineract; se toma como aplicada.`,
        );
        return null;
      }
      throw this.traducir(error);
    }
  }

  /** Deshace un pago. Sin el identificador del movimiento no se adivina cuál. */
  async revertirPago(input: RevertirPagoExterno): Promise<boolean> {
    if (!input.pagoIdExterno) {
      throw new ErrorIntegracionExterna(
        `El pago ${input.pagoId} no tiene identificador en Fineract, así que no hay movimiento que deshacer. Si allá sí se aplicó, deshazlo a mano.`,
        false,
      );
    }
    try {
      await this.http.post(
        `/v1/loans/${input.creditoIdExterno}/transactions/${input.pagoIdExterno}?command=undo`,
        {
          transactionDate: input.fecha,
          note: input.motivo ?? 'Reversa desde SyncroERP',
          locale: this.cfg.localePorDefecto,
          dateFormat: this.cfg.formatoFecha,
        },
      );
      return true;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  // ── Catálogo de productos ────────────────────────────────────────────────

  /**
   * Crea el producto de préstamo equivalente al del catálogo del ERP.
   *
   * Fineract no admite un identificador externo en los productos, así que la
   * idempotencia se apoya en el nombre, que sí es único allá: si ya existe uno
   * con ese nombre se reutiliza en lugar de duplicarlo. Duplicar un producto
   * de crédito no rompe nada visible el primer día y arruina cualquier reporte
   * a partir del segundo.
   */
  async crearProductoCredito(
    input: CrearProductoCreditoExterno,
  ): Promise<ProductoCreditoExterno> {
    try {
      const existentes = await this.listarProductosCredito(input.empresaId);
      const yaEsta = existentes.find(
        (p) => p.nombre.trim().toLowerCase() === input.nombre.trim().toLowerCase(),
      );
      if (yaEsta) return yaEsta;

      /*
       * Sin bucket de morosidad, los creditos de este producto reportan
       * importe vencido y cero dias de atraso, para siempre. Se resuelve por
       * nombre; si no existe, se crea el producto igual y queda avisado en el
       * log.
       */
      const bucketMora = await this.idBucketMora();

      const cuerpo: Record<string, unknown> = {
        name: input.nombre,
        shortName: this.nombreCorto(input.codigo, input.productoId),
        description:
          input.descripcion ??
          `Producto ${input.codigo} de SyncroERP. La definición comercial vive en el ERP.`,
        currencyCode: input.moneda || this.cfg.monedaPorDefecto,
        digitsAfterDecimal: 2,
        inMultiplesOf: 1,
        // Fineract exige un principal en la plantilla; cada crédito manda el
        // suyo. Es un valor de referencia, no un límite.
        principal: 10000,
        numberOfRepayments: input.cuotasMinimas,
        minNumberOfRepayments: input.cuotasMinimas,
        maxNumberOfRepayments: input.cuotasMaximas,
        repaymentEvery: input.cadaCuantos,
        repaymentFrequencyType: this.unidadDe(input.unidadPlazo),
        interestRatePerPeriod: input.sinInteres ? 0 : input.tasaInteresMensual,
        interestRateFrequencyType: TASA_POR_MES,
        amortizationType: AMORTIZACION_CUOTAS_IGUALES,
        interestType: input.sinInteres ? INTERES_PLANO : INTERES_SALDOS_INSOLUTOS,
        interestCalculationPeriodType: PERIODO_CALCULO_IGUAL_A_CUOTA,
        transactionProcessingStrategyCode: 'mifos-standard-strategy',
        accountingRule: SIN_CONTABILIDAD,
        daysInYearType: DIAS_REALES,
        daysInMonthType: DIAS_REALES,
        /*
         * Todo lo que el ERP no modela se declara APAGADO, explícitamente.
         * Fineract exige varias de estas banderas y, más importante, cada una
         * encendida es una forma de que su tabla deje de parecerse a la del
         * ERP sin que nadie lo pida: recálculo de interés, tramos de
         * desembolso, cuotas variables, tasas flotantes.
         */
        isInterestRecalculationEnabled: false,
        isLinkedToFloatingInterestRates: false,
        allowVariableInstallments: false,
        canDefineInstallmentAmount: false,
        multiDisburseLoan: false,
        holdGuaranteeFunds: false,
        accountMovesOutOfNPAOnlyOnArrearsCompletion: false,
        isEqualAmortization: false,
        ...(bucketMora ? { delinquencyBucketId: bucketMora } : {}),
        locale: this.cfg.localePorDefecto,
        dateFormat: this.cfg.formatoFecha,
      };

      const respuesta = await this.http.post<{ resourceId: number }>(
        '/v1/loanproducts',
        cuerpo,
        { timeoutMs: this.cfg.timeoutFondoMs },
      );

      return {
        idExterno: String(respuesta.resourceId),
        codigo: input.codigo,
        nombre: input.nombre,
        unidadPlazo: input.unidadPlazo,
        cadaCuantos: input.cadaCuantos,
        cuotasMinimas: input.cuotasMinimas,
        cuotasMaximas: input.cuotasMaximas,
        sinInteres: input.sinInteres,
        tasaInteresMensual: input.tasaInteresMensual,
        moneda: input.moneda || this.cfg.monedaPorDefecto,
      };
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** El catálogo de Fineract es del tenant, no de la empresa: el parámetro se
   * recibe por contrato del puerto y aquí no discrimina. */
  async listarProductosCredito(
    _empresaId?: string,
  ): Promise<ProductoCreditoExterno[]> {
    try {
      const respuesta = await this.http.get<
        Array<{
          id: number;
          name: string;
          shortName?: string;
          numberOfRepayments?: number;
          minNumberOfRepayments?: number;
          maxNumberOfRepayments?: number;
          repaymentEvery?: number;
          repaymentFrequencyType?: { id: number };
          interestRatePerPeriod?: number;
          interestType?: { id: number };
          currency?: { code?: string };
        }>
      >('/v1/loanproducts', { timeoutMs: this.cfg.timeoutFondoMs });

      return (respuesta ?? []).map((p) => ({
        idExterno: String(p.id),
        codigo: p.shortName ?? null,
        nombre: p.name,
        unidadPlazo:
          p.repaymentFrequencyType?.id === FRECUENCIA_DIAS ? 'DIAS' : 'MESES',
        cadaCuantos: Number(p.repaymentEvery ?? 1),
        cuotasMinimas: Number(
          p.minNumberOfRepayments ?? p.numberOfRepayments ?? 1,
        ),
        cuotasMaximas: Number(
          p.maxNumberOfRepayments ?? p.numberOfRepayments ?? 1,
        ),
        sinInteres: Number(p.interestRatePerPeriod ?? 0) === 0,
        tasaInteresMensual: Number(p.interestRatePerPeriod ?? 0),
        moneda: p.currency?.code ?? this.cfg.monedaPorDefecto,
      }));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Pide a Fineract la tabla que calcularía, sin crear el préstamo.
   *
   * Esto es lo que sostiene la correspondencia. Comparar las definiciones de
   * los dos productos no sirve: durante semanas los importes cuadraron peso por
   * peso mientras las fechas de vencimiento estaban equivocadas, porque el
   * plazo se mandaba en meses en vez de días. Lo único que revela eso es
   * comparar la tabla completa, cuota por cuota, fecha por fecha.
   */
  async fechaMinimaProyeccion(clienteIdExterno: string): Promise<string | null> {
    try {
      const cliente = await this.http.get<{
        timeline?: { activatedOnDate?: number[] };
      }>(`/v1/clients/${encodeURIComponent(clienteIdExterno)}`, {
        timeoutMs: this.cfg.timeoutFondoMs,
      });
      return this.fechaDeArreglo(cliente.timeline?.activatedOnDate) || null;
    } catch (error) {
      throw this.traducir(error);
    }
  }

  async proyectarAmortizacion(
    input: ProyectarAmortizacionExterna,
  ): Promise<CuotaProyectada[]> {
    try {
      /*
       * Todo lo que define al PRODUCTO se lee de Fineract, no se manda. Es lo
       * que convierte esta llamada en una comparación de verdad: si allá la
       * tasa es 1.5% y aquí alguien la puso en 4.75%, las tablas difieren y se
       * ve. Mandando la tasa —como hacía la primera versión— los dos lados
       * calculaban con el mismo número y la divergencia era invisible.
       */
      const producto = await this.http.get<{
        repaymentEvery?: number;
        repaymentFrequencyType?: { id: number };
        interestRatePerPeriod?: number;
        interestType?: { id: number };
        amortizationType?: { id: number };
        interestCalculationPeriodType?: { id: number };
      }>(`/v1/loanproducts/${input.productoIdExterno}`, {
        timeoutMs: this.cfg.timeoutFondoMs,
      });

      const cada = Number(producto.repaymentEvery ?? 1);
      const unidad = Number(
        producto.repaymentFrequencyType?.id ?? FRECUENCIA_MESES,
      );
      const tasa = Number(producto.interestRatePerPeriod ?? 0);
      const tipoInteres = Number(
        producto.interestType?.id ??
          (tasa > 0 ? INTERES_SALDOS_INSOLUTOS : INTERES_PLANO),
      );

      const cuerpo: Record<string, unknown> = {
        productId: Number(input.productoIdExterno),
        loanType: 'individual',
        principal: input.capital,
        numberOfRepayments: input.numeroCuotas,
        repaymentEvery: cada,
        repaymentFrequencyType: unidad,
        loanTermFrequency: cada * input.numeroCuotas,
        loanTermFrequencyType: unidad,
        interestRatePerPeriod: tasa,
        interestType: tipoInteres,
        amortizationType: Number(
          producto.amortizationType?.id ?? AMORTIZACION_CUOTAS_IGUALES,
        ),
        interestCalculationPeriodType: Number(
          producto.interestCalculationPeriodType?.id ??
            PERIODO_CALCULO_IGUAL_A_CUOTA,
        ),
        transactionProcessingStrategyCode: 'mifos-standard-strategy',
        expectedDisbursementDate: input.fechaInicio,
        submittedOnDate: input.fechaInicio,
        locale: this.cfg.localePorDefecto,
        dateFormat: this.cfg.formatoFecha,
      };
      if (input.clienteIdExterno) {
        cuerpo.clientId = Number(input.clienteIdExterno);
      }

      const respuesta = await this.http.post<{
        periods?: Array<{
          period?: number;
          dueDate?: number[];
          principalDue?: number;
          principalOriginalDue?: number;
          interestDue?: number;
          interestOriginalDue?: number;
          totalDueForPeriod?: number;
        }>;
      }>('/v1/loans?command=calculateLoanSchedule', cuerpo, {
        timeoutMs: this.cfg.timeoutFondoMs,
      });

      return (respuesta.periods ?? [])
        // El periodo 0 es el desembolso, no una cuota.
        .filter((p) => Number(p.period ?? 0) >= 1)
        .map((p) => {
          const capital = Number(p.principalDue ?? p.principalOriginalDue ?? 0);
          const interes = Number(p.interestDue ?? p.interestOriginalDue ?? 0);
          return {
            numeroCuota: Number(p.period),
            fechaVencimiento: this.fechaDeArreglo(p.dueDate),
            montoCapital: capital,
            montoInteres: interes,
            montoCuota: Number(p.totalDueForPeriod ?? capital + interes),
          };
        });
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /**
   * Nombre corto de cuatro caracteres, que es lo que Fineract exige y además
   * obliga a que sea único. Se deriva del código para que sea reconocible, y se
   * completa con el uuid del producto para que dos códigos que empiezan igual
   * no choquen.
   */
  private nombreCorto(codigo: string, productoId: string): string {
    const limpio = codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const relleno = productoId.replace(/[^a-f0-9]/gi, '').toUpperCase();
    return (limpio.slice(0, 2) + relleno.slice(0, 2)).padEnd(4, 'X').slice(0, 4);
  }

  /** Fineract devuelve las fechas como [año, mes, día]. */
  private fechaDeArreglo(valor?: number[]): string {
    if (!valor || valor.length < 3) return '';
    const [a, m, d] = valor;
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  private async crearSolicitud(
    input: OriginarCreditoExterno,
    referencia: string,
  ): Promise<string> {
    const sinInteres = input.sinInteres || input.tasaInteresMensual <= 0;
    const periodo = this.periodoDe(input);
    const productoId = await this.productoPara(input, sinInteres);

    const respuesta = await this.http.post<{
      loanId: number;
      resourceId: number;
    }>('/v1/loans', {
      clientId: Number(input.clienteIdExterno),
      productId: productoId,
      externalId: referencia,
      loanType: 'individual',
      principal: input.capital,
      numberOfRepayments: input.numeroCuotas,
      repaymentEvery: periodo.cada,
      repaymentFrequencyType: periodo.unidad,
      loanTermFrequency: periodo.cada * input.numeroCuotas,
      loanTermFrequencyType: periodo.unidad,
      interestRatePerPeriod: sinInteres ? 0 : input.tasaInteresMensual,
      interestType: sinInteres ? INTERES_PLANO : INTERES_SALDOS_INSOLUTOS,
      amortizationType: AMORTIZACION_CUOTAS_IGUALES,
      interestCalculationPeriodType: PERIODO_CALCULO_IGUAL_A_CUOTA,
      transactionProcessingStrategyCode: 'mifos-standard-strategy',
      expectedDisbursementDate: input.fechaInicio,
      submittedOnDate: input.fechaInicio,
      locale: this.cfg.localePorDefecto,
      dateFormat: this.cfg.formatoFecha,
    });

    return String(respuesta.loanId ?? respuesta.resourceId);
  }

  private async estadoPrestamo(prestamoId: string) {
    const respuesta = await this.http.get<{
      status?: {
        pendingApproval?: boolean;
        active?: boolean;
        closed?: boolean;
        overpaid?: boolean;
        code?: string;
      };
    }>(`/v1/loans/${prestamoId}`);

    const codigo = String(respuesta.status?.code ?? '');
    return {
      codigo,
      pendienteAprobacion: respuesta.status?.pendingApproval === true,
      activo: respuesta.status?.active === true,
      /** Aprobado pero sin desembolsar: el escalón intermedio del ciclo. */
      aprobado: codigo.endsWith('approved'),
      desembolsado:
        respuesta.status?.active === true || respuesta.status?.closed === true,
      /** Retirado o rechazado: ya no es un préstamo vivo ni lo será. */
      cancelado:
        codigo.includes('withdrawn') ||
        codigo.includes('rejected') ||
        codigo.includes('closed.written'),
    };
  }

  /**
   * Traduce el plazo del ERP al periodo de repago de Fineract.
   *
   * Los créditos de una exhibición se expresan en DÍAS porque así los calcula
   * el ERP; las mensualidades, en meses. Si esto se equivoca, los importes
   * siguen cuadrando y sólo se descubre comparando fechas de vencimiento.
   */
  private periodoDe(input: {
    tipoCredito: string;
    unidadPlazo?: 'DIAS' | 'MESES' | null;
    cadaCuantos?: number | null;
  }): { cada: number; unidad: number } {
    // Lo que diga el producto manda. El respaldo por tipo sólo cubre a los
    // créditos emitidos antes del catálogo.
    if (input.unidadPlazo && input.cadaCuantos && input.cadaCuantos > 0) {
      return {
        cada: input.cadaCuantos,
        unidad:
          input.unidadPlazo === 'DIAS' ? FRECUENCIA_DIAS : FRECUENCIA_MESES,
      };
    }
    const dias = DIAS_POR_TIPO[input.tipoCredito];
    return dias
      ? { cada: dias, unidad: FRECUENCIA_DIAS }
      : { cada: 1, unidad: FRECUENCIA_MESES };
  }

  private unidadDe(unidad: 'DIAS' | 'MESES'): number {
    return unidad === 'DIAS' ? FRECUENCIA_DIAS : FRECUENCIA_MESES;
  }

  /**
   * Resuelve el producto de préstamo de Fineract con el que se origina.
   *
   * El camino bueno es el vínculo: el producto del catálogo del ERP tiene su
   * correspondencia registrada igual que un cliente o un crédito. El respaldo
   * por `parametrosProveedor` existe para las empresas que se configuraron
   * cuando los tres ids se capturaban a mano, y se retira cuando ya no queden.
   *
   * Sin producto no se inventa nada: adivinarlo significaría aplicar una tasa
   * y un esquema contable que nadie autorizó.
   */
  private async productoPara(
    input: OriginarCreditoExterno,
    sinInteres: boolean,
  ): Promise<number> {
    if (input.productoCreditoId) {
      const vinculo = await this.vinculos.findOne({
        where: {
          empresaId: input.empresaId,
          tipo: TipoVinculo.PRODUCTO_CREDITO,
          entidadId: input.productoCreditoId,
        },
      });
      if (vinculo?.idExterno) return Number(vinculo.idExterno);

      throw new ErrorIntegracionExterna(
        `El producto de crédito ${input.productoCreditoId} no está sincronizado con Fineract. Sincronízalo antes de vender con él.`,
        false,
      );
    }

    const p = await this.parametros(input.empresaId);
    const producto = CREDITOS_SIMPLES.has(input.tipoCredito)
      ? p.productoCreditoSimpleId
      : sinInteres || input.tipoCredito === 'MSI_BANCO'
        ? (p.productoMsiId ?? p.productoMensualidadesId)
        : p.productoMensualidadesId;

    if (!producto) {
      throw new ErrorIntegracionExterna(
        `La empresa no tiene configurado el producto de Fineract para ${input.tipoCredito}.`,
        false,
      );
    }
    return producto;
  }

  private async parametros(empresaId: string): Promise<ParametrosFineract> {
    const fila = await this.configEmpresa.findOne({ where: { empresaId } });
    return (fila?.parametrosProveedor ?? {}) as ParametrosFineract;
  }

  /** Devuelve el id si el recurso ya existía con esa referencia. */
  private async buscarPorReferencia(
    recurso: 'clients' | 'loans',
    referencia: string,
  ): Promise<string | null> {
    try {
      const respuesta = await this.http.get<{ id: number }>(
        `/v1/${recurso}/external-id/${encodeURIComponent(referencia)}`,
      );
      return respuesta?.id ? String(respuesta.id) : null;
    } catch (error) {
      if (error instanceof ErrorFineract && error.estadoHttp === 404) {
        return null;
      }
      throw this.traducir(error);
    }
  }

  /**
   * Un 403 al crear suele significar «externalId duplicado»: el POST anterior
   * sí se aplicó y se perdió la respuesta. Se resuelve consultando, no
   * creando un gemelo.
   */
  private async recuperarDuplicado(
    error: unknown,
    recurso: 'clients' | 'loans',
    referencia: string,
  ): Promise<string | null> {
    if (!(error instanceof ErrorFineract) || error.estadoHttp !== 403) {
      return null;
    }
    return this.buscarPorReferencia(recurso, referencia);
  }

  /** Traduce el error del proveedor al vocabulario del puerto. */
  private traducir(error: unknown): ErrorIntegracionExterna {
    if (error instanceof ErrorIntegracionExterna) return error;
    if (error instanceof ErrorFineract) {
      return new ErrorIntegracionExterna(
        error.message,
        error.reintentable,
        { estadoHttp: error.estadoHttp, cuerpo: error.cuerpo },
        error.pudoAplicarse,
      );
    }
    return new ErrorIntegracionExterna(
      error instanceof Error ? error.message : String(error),
      true,
    );
  }

  private fecha(valor: Date | string | null | undefined): string {
    return (valor ? new Date(valor) : new Date()).toISOString().slice(0, 10);
  }
}
