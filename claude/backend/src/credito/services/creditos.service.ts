import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import {
  CreditoCliente,
  TipoCredito,
  EstadoCredito,
} from '../entities/credito-cliente.entity';
import {
  AmortizacionCuota,
  EstadoCuota,
} from '../entities/amortizacion-cuota.entity';
import { PagoCobranza } from '../entities/pago-cobranza.entity';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { Venta } from '../../ventas/entities/venta.entity';
import { CuentaBancaria } from '../entities/cuenta-bancaria.entity';
import { CrearCreditoDto, SimularCreditoDto } from '../dto/crear-credito.dto';
import { PoliticaCreditoService } from '../../common/services/politica-credito.service';
import { fechaCalendario } from '../../common/utils/fecha-calendario.util';
import { CarteraPublicadorService } from '../../integracion/services/cartera-publicador.service';
import {
  AjustadorVencimiento,
  PoliticaVencimientoService,
} from './politica-vencimiento.service';
import { ProductosCreditoService } from './productos-credito.service';
import {
  ProductoCredito,
  UnidadPlazo,
} from '../entities/producto-credito.entity';

export interface ResultadoAmortizacion {
  numeroCuota: number;
  fechaVencimiento: Date;
  /**
   * La fecha antes de recorrerla a día hábil. El plazo autorizado de la línea
   * se valida contra ESTA, para que recorrer un sábado no se convierta en una
   * extensión de crédito que nadie autorizó.
   */
  fechaVencimientoSinAjuste?: Date;
  montoCapital: number;
  montoInteres: number;
  montoCuota: number;
  saldoRestante: number;
}

export type CrearCreditoInput = CrearCreditoDto & {
  empresaId: string;
  saldoFavorAplicado?: number;
  /**
   * Plazo resuelto desde el producto. No lo manda quien llama: lo escribe
   * `crearCredito` al resolver `productoCreditoId`, y de ahí viaja a la
   * amortización y al registro externo.
   */
  unidadPlazo?: UnidadPlazo;
  cadaCuantos?: number;
};

@Injectable()
export class CreditosService {
  constructor(
    @InjectRepository(CreditoCliente)
    private readonly creditoRepo: Repository<CreditoCliente>,
    @InjectRepository(AmortizacionCuota)
    private readonly cuotaRepo: Repository<AmortizacionCuota>,
    @InjectRepository(PagoCobranza)
    private readonly pagoRepo: Repository<PagoCobranza>,
    private readonly dataSource: DataSource,
    private readonly notificaciones: NotificacionesService,
    private readonly politicaCredito: PoliticaCreditoService,
    private readonly cartera: CarteraPublicadorService,
    private readonly vencimientos: PoliticaVencimientoService,
    private readonly productos: ProductosCreditoService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CÁLCULO DE AMORTIZACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  calcularAmortizacion(
    dto: SimularCreditoDto,
    ajustar: AjustadorVencimiento = (f) => f,
  ): ResultadoAmortizacion[] {
    const { capital, numeroCuotas, tasaInteresMensual, sinInteres } = dto;
    // A medianoche LOCAL: `new Date('2026-09-08')` es medianoche UTC, que en
    // México se lee como día 7 con los captadores locales que usan tanto el
    // ajuste a día hábil como TypeORM al guardar.
    const inicio = fechaCalendario(dto.fechaInicio);
    const tabla: ResultadoAmortizacion[] = [];
    // Se conservan las dos fechas: la que ve el cliente y la que gobierna el
    // plazo autorizado. Guardar sólo una obliga a elegir cuál se miente.
    const vencimiento = (sinAjuste: Date) => ({
      fechaVencimiento: ajustar(sinAjuste),
      fechaVencimientoSinAjuste: sinAjuste,
    });
    /*
     * Cuándo vence la cuota i. Manda el producto —cada cuántos días o meses—;
     * el respaldo por `tipoCredito` sólo cubre a quien todavía llame con el
     * contrato anterior. Es la misma distinción que el adaptador se comió
     * durante semanas: días y meses no son intercambiables aunque los importes
     * salgan iguales.
     */
    const fechaCuota = (i: number): Date => {
      if (dto.unidadPlazo && dto.cadaCuantos && dto.cadaCuantos > 0) {
        return dto.unidadPlazo === UnidadPlazo.DIAS
          ? this.sumarDias(inicio, dto.cadaCuantos * i)
          : this.sumarMeses(inicio, dto.cadaCuantos * i);
      }
      return numeroCuotas === 1 && dto.tipoCredito
        ? this.fechaPorTipo(inicio, dto.tipoCredito)
        : this.sumarMeses(inicio, i);
    };

    if (sinInteres || tasaInteresMensual === 0) {
      // SIN INTERÉS: cuotas iguales de capital puro
      const cuotaCapital = this.redondear(capital / numeroCuotas);
      let saldo = capital;
      for (let i = 1; i <= numeroCuotas; i++) {
        const capEsta =
          i === numeroCuotas ? this.redondear(saldo) : cuotaCapital;
        saldo = this.redondear(saldo - capEsta);
        tabla.push({
          numeroCuota: i,
          ...vencimiento(fechaCuota(i)),
          montoCapital: capEsta,
          montoInteres: 0,
          montoCuota: capEsta,
          saldoRestante: saldo,
        });
      }
    } else {
      // CON INTERÉS: método francés
      const r = tasaInteresMensual / 100;
      const cuotaFija = this.redondear(
        (capital * r) / (1 - Math.pow(1 + r, -numeroCuotas)),
      );
      let saldo = capital;
      for (let i = 1; i <= numeroCuotas; i++) {
        const interes = this.redondear(saldo * r);
        let capital_ = this.redondear(cuotaFija - interes);
        let cuota = cuotaFija;
        if (i === numeroCuotas) {
          capital_ = this.redondear(saldo);
          cuota = this.redondear(capital_ + interes);
        }
        saldo = this.redondear(saldo - capital_);
        tabla.push({
          numeroCuota: i,
          ...vencimiento(fechaCuota(i)),
          montoCapital: capital_,
          montoInteres: interes,
          montoCuota: cuota,
          saldoRestante: Math.max(0, saldo),
        });
      }
    }
    return tabla;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREAR CRÉDITO
  // ──────────────────────────────────────────────────────────────────────────
  async crearCredito(
    dto: CrearCreditoInput,
    manager?: EntityManager,
  ) {
    if (!Number.isFinite(Number(dto.montoVenta)) || Number(dto.montoVenta) <= 0)
      throw new BadRequestException(
        'El monto de la venta debe ser mayor a cero.',
      );
    /*
     * Resolución del producto.
     *
     * Con `productoCreditoId` mandan el plazo, la tasa y los límites de la fila
     * del catálogo, no lo que venga en la captura: por eso se sobreescriben los
     * campos antes de validar nada más. Es lo que impide que el punto de venta
     * pida seis meses de un producto que sólo admite tres, o mueva una tasa que
     * nadie autorizó.
     *
     * Sin `productoCreditoId` sigue funcionando el contrato anterior, que es lo
     * que mantiene vivos los créditos ya emitidos y a quien llame a la API como
     * la llamaba ayer.
     */
    let producto: ProductoCredito | null = null;
    if (dto.productoCreditoId) {
      const capitalTentativo = this.redondear(
        Number(dto.montoVenta) -
          Number(dto.enganche ?? 0) -
          Number(dto.saldoFavorAplicado ?? 0),
      );
      /*
       * Esto se comprueba ANTES de mirar el producto. Si no, un enganche mayor
       * que la venta llega al catálogo como un capital negativo y se rechaza
       * por «no alcanza el importe mínimo», que es cierto y no le sirve a
       * nadie: quien lo lea va a ir a revisar los límites del producto en vez
       * del enganche que capturó.
       */
      if (capitalTentativo <= 0) {
        throw new BadRequestException(
          'El enganche no puede ser mayor o igual al monto de la venta.',
        );
      }
      producto = await this.productos.resolverParaVenta(
        dto.empresaId,
        dto.productoCreditoId,
        {
          numeroCuotas: Number(dto.numeroCuotas),
          importe: capitalTentativo,
          tasaInteresMensual: dto.tasaInteresMensual,
        },
        manager,
      );
      dto.sinInteres = producto.sinInteres;
      dto.tasaInteresMensual = producto.sinInteres
        ? 0
        : Number(dto.tasaInteresMensual ?? producto.tasaInteresMensual);
      dto.unidadPlazo = producto.unidadPlazo;
      dto.cadaCuantos = producto.cadaCuantos;
      dto.tipoCredito = this.tipoHeredadoDe(producto);
    }

    if (!dto.tipoCredito || !Object.values(TipoCredito).includes(dto.tipoCredito))
      throw new BadRequestException('El tipo de crédito no es válido.');
    if (
      !Number.isInteger(Number(dto.numeroCuotas)) ||
      Number(dto.numeroCuotas) < 1
    )
      throw new BadRequestException(
        'El número de cuotas debe ser al menos uno.',
      );
    if (!Number.isFinite(Number(dto.enganche)) || Number(dto.enganche) < 0)
      throw new BadRequestException(
        'El enganche debe ser un importe válido no negativo.',
      );
    if (
      !Number.isFinite(Number(dto.tasaInteresMensual)) ||
      Number(dto.tasaInteresMensual) < 0 ||
      Number(dto.tasaInteresMensual) > 100
    )
      throw new BadRequestException(
        'La tasa de interés mensual debe estar entre 0 y 100.',
      );
    if (dto.sinInteres && Number(dto.tasaInteresMensual) !== 0)
      throw new BadRequestException(
        'Un crédito sin interés debe tener tasa mensual igual a cero.',
      );
    const fechaInicio = fechaCalendario(dto.fechaInicio);
    if (Number.isNaN(fechaInicio.getTime()))
      throw new BadRequestException(
        'La fecha de inicio del crédito no es válida.',
      );

    const saldoFavorAplicado = this.redondear(
      Number(dto.saldoFavorAplicado ?? 0),
    );
    if (!manager && saldoFavorAplicado > 0)
      throw new BadRequestException(
        'El saldo a favor solo puede aplicarse desde una venta transaccional.',
      );
    // Con producto, el rango de cuotas ya lo impuso el catálogo. Sin producto
    // sigue vigente la regla vieja, que era la única que había.
    if (
      !producto &&
      dto.tipoCredito !== TipoCredito.MENSUALIDADES &&
      dto.tipoCredito !== TipoCredito.MSI_BANCO &&
      Number(dto.numeroCuotas) !== 1
    )
      throw new BadRequestException(
        'Los créditos de 30, 60 y 90 días tienen una sola fecha de vencimiento.',
      );
    const capitalFinanciado = this.redondear(
      dto.montoVenta - dto.enganche - saldoFavorAplicado,
    );
    if (capitalFinanciado <= 0)
      throw new BadRequestException(
        'El enganche no puede ser mayor al monto de la venta.',
      );

    const ajustar = await this.vencimientos.ajustadorDe(dto.empresaId, manager);
    const tabla = this.calcularAmortizacion({
      capital: capitalFinanciado,
      numeroCuotas: dto.numeroCuotas,
      tasaInteresMensual: dto.tasaInteresMensual,
      sinInteres: dto.sinInteres,
      fechaInicio: dto.fechaInicio,
      tipoCredito: dto.tipoCredito,
      unidadPlazo: dto.unidadPlazo,
      cadaCuantos: dto.cadaCuantos,
    }, ajustar);
    const totalIntereses = this.redondear(
      tabla.reduce((s, r) => s + r.montoInteres, 0),
    );
    const montoTotal = this.redondear(capitalFinanciado + totalIntereses);
    const ultimaCuota = tabla[tabla.length - 1];

    const guardar = async (em: EntityManager) => {
      await this.politicaCredito.validarOperacionEnTransaccion(
        em,
        {
          empresaId: dto.empresaId,
          clienteId: dto.clienteId,
          importe: montoTotal,
          // Contra la fecha SIN ajustar: el recorrido a día hábil es una
          // cortesía de calendario, no un plazo mayor del autorizado.
          fechaVencimiento:
            ultimaCuota.fechaVencimientoSinAjuste ?? ultimaCuota.fechaVencimiento,
          fechaCorte: dto.fechaInicio?.slice(0, 10),
        },
      );
      if (dto.numeroCuotas > 60) {
        throw new BadRequestException('El crédito no puede exceder 60 cuotas.');
      }


      if (dto.ventaId) {
        const venta = await em.findOne(Venta, {
          where: { id: dto.ventaId, empresaId: dto.empresaId },
        });
        if (!venta) {
          throw new NotFoundException(
            'La venta no existe o pertenece a otra empresa.',
          );
        }
        if (venta.clienteId !== dto.clienteId) {
          throw new BadRequestException(
            'El cliente del crédito no coincide con el cliente de la venta.',
          );
        }
        if (Math.abs(Number(venta.total) - Number(dto.montoVenta)) >= 0.01) {
          throw new BadRequestException(
            'El monto del crédito no coincide con el total autorizado de la venta.',
          );
        }
        const duplicado = await em.findOne(CreditoCliente, {
          where: { empresaId: dto.empresaId, ventaId: dto.ventaId },
        });
        if (duplicado) {
          throw new BadRequestException(
            `La venta ya tiene el crédito ${duplicado.folio}.`,
          );
        }
      }

      if (Number(dto.enganche) > 0) {
        if (!dto.metodoPagoEnganche || !dto.cuentaBancariaEngancheId) {
          throw new BadRequestException(
            'Un crédito con enganche requiere método de pago y cuenta de caja/banco/TPV.',
          );
        }
        const cuentaEnganche = await em.findOne(CuentaBancaria, {
          where: {
            id: dto.cuentaBancariaEngancheId,
            empresaId: dto.empresaId,
            activo: true,
          },
        });
        if (!cuentaEnganche) {
          throw new BadRequestException(
            'La cuenta del enganche no existe, está inactiva o pertenece a otra empresa.',
          );
        }
      }

      const folio = await this.generarFolio(dto.empresaId, em);

      const credito = em.create(CreditoCliente, {
        empresaId: dto.empresaId,
        folio,
        clienteId: dto.clienteId,
        ventaId: dto.ventaId,
        productoCreditoId: producto?.id ?? null,
        tipoCredito: dto.tipoCredito,
        montoVenta: dto.montoVenta,
        enganche: dto.enganche,
        capitalFinanciado,
        totalIntereses,
        montoTotal,
        saldoPendiente: montoTotal,
        numeroCuotas: dto.numeroCuotas,
        tasaInteresMensual: dto.tasaInteresMensual,
        sinInteres: dto.sinInteres,
        fechaInicio,
        fechaVencimiento: ultimaCuota.fechaVencimiento,
        metodoPagoEnganche: dto.metodoPagoEnganche,
        cuentaBancariaEngancheId: dto.cuentaBancariaEngancheId,
        estado: EstadoCredito.ACTIVO,
        notas: dto.notas,
      });
      const guardado = await em.save(credito);

      const cuotas = tabla.map((t) =>
        em.create(AmortizacionCuota, {
          creditoId: guardado.id,
          numeroCuota: t.numeroCuota,
          fechaVencimiento: t.fechaVencimiento,
          montoCapital: t.montoCapital,
          montoInteres: t.montoInteres,
          montoCuota: t.montoCuota,
          saldoRestante: t.saldoRestante,
          montoPagado: 0,
          estado: EstadoCuota.PENDIENTE,
        }),
      );
      await em.save(cuotas);

      /*
       * El hecho se publica DENTRO de la transacción del crédito. Si la venta
       * se revierte, el evento se revierte con ella y el registro externo nunca
       * supo de un crédito que no existió. La llamada al proveedor la hace
       * después el despachador: aquí sólo se escribe una fila.
       */
      await this.cartera.creditoOriginado(dto.empresaId, guardado.id, em);

      return em.findOne(CreditoCliente, {
        where: { id: guardado.id },
        relations: ['cuotas'],
      });
    };

    const creditoGuardado = manager
      ? await guardar(manager)
      : await this.dataSource.transaction(guardar);

    // ── Email de crédito otorgado al cliente ────────────────────────────────
    // Se manda aquí (no en VentasService) para incluir la tabla de cuotas
    if (!manager) {
      this.enviarEmailCredito(creditoGuardado, dto.empresaId).catch((e) =>
        console.error('[Email] Crédito:', e?.message),
      );
    }

    return creditoGuardado;
  }

  async obtenerPoliticaCliente(clienteId: string, empresaId: string) {
    const resumen = await this.politicaCredito.obtenerResumen(
      empresaId,
      clienteId,
    );
    return {
      clienteId,
      limite: resumen.limite,
      diasCredito: resumen.diasCredito,
      utilizado: resumen.utilizado,
      saldoVentas: resumen.saldoVentas,
      saldoHotel: resumen.saldoHotel,
      disponible: resumen.disponible,
      vencido: resumen.vencido,
      vencidoVentas: resumen.vencidoVentas,
      vencidoHotel: resumen.vencidoHotel,
      estadoCredito: resumen.cliente.estadoCredito,
      versionCredito: resumen.versionCredito,
      nivelRiesgo: resumen.cliente.nivelRiesgo,
      clasificacionHotelera:
        resumen.cliente.clasificacionHotelera ?? null,
      bloquearConSaldoVencido: resumen.bloquearConSaldoVencido,
      puedeComprarCredito: resumen.puedeOperar,
      razonBloqueo: resumen.razonBloqueo,
    };
  }

  // ── Carga el cliente y manda el email de crédito ───────────────────────
  private async enviarEmailCredito(credito: CreditoCliente, empresaId: string) {
    try {
      const clientes = await this.dataSource.query(
        `SELECT id, nombre, email, rfc FROM clientes WHERE id = $1 AND empresaId = $2`,
        [credito.clienteId, empresaId],
      );
      const cliente = clientes?.[0];
      if (!cliente?.email) return;

      // Obtener venta si existe
      let venta: any = null;
      if (credito.ventaId) {
        const ventas = await this.dataSource.query(
          // Sin el alias, el correo de crédito otorgado salía sin método de pago.
          `SELECT id, folio, total, metodoPago AS "metodoPago" FROM ventas WHERE id = $1 AND empresaId = $2`,
          [credito.ventaId, empresaId],
        );
        venta = ventas?.[0] ?? null;
      }

      await this.notificaciones.notificarCreditoOtorgado(
        venta,
        credito,
        cliente,
      );
    } catch (e: any) {
      console.error('[Email] Crédito load:', e?.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAS
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerTodos(
    empresaId: string,
    estado?: EstadoCredito,
    ventaId?: string,
  ) {
    const qb = this.creditoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cuotas', 'cuotas')
      .where('c.empresaId = :empresaId', { empresaId })
      .orderBy('c.fechaCreacion', 'DESC');
    if (estado) qb.andWhere('c.estado = :estado', { estado });
    if (ventaId) qb.andWhere('c.ventaId = :ventaId', { ventaId });
    const creditos = await qb.getMany();
    return this.enriquecerConClientes(creditos, empresaId);
  }

  /*
   * `empresaId` no es decorativo aqui. Los ids salen de creditos que YA estaban
   * filtrados por empresa, asi que hoy la consulta no puede traer un cliente
   * ajeno. Pero eso depende de que el filtro de arriba siga estando: el dia que
   * alguien agregue un camino que no filtre, esta consulta devolveria nombres y
   * RFC de clientes de otra empresa sin una sola señal. En multiempresa la
   * regla es que CADA consulta se defienda sola, no que confie en la anterior.
   */
  private async enriquecerConClientes(
    creditos: CreditoCliente[],
    empresaId: string,
  ): Promise<any[]> {
    if (!creditos.length) return creditos;
    const ids = [...new Set(creditos.map((c) => c.clienteId).filter(Boolean))];
    if (!ids.length) return creditos;
    /*
     * `$1, $2, …` — no `@0, @1`. El marcador con arroba es de SQL Server; en
     * Postgres `@0` se lee como un operador aplicado a un número y la consulta
     * revienta con «operator does not exist: uuid = integer».
     *
     * El `.catch` que había aquí se lo tragaba en silencio y el reporte salía
     * con TODOS los clientes en nulo. Ahora, si falla, se sabe.
     */
    const clientes: { id: string; nombre: string; rfc: string }[] =
      await this.dataSource.query(
        `SELECT id, nombre, rfc FROM clientes WHERE empresaId = $${ids.length + 1} AND id IN (${ids
          .map((_, i) => `$${i + 1}`)
          .join(',')})`,
        [...ids, empresaId],
      );
    const clienteMap = new Map(clientes.map((cl: any) => [cl.id, cl]));
    return creditos.map((c) => ({
      ...c,
      cliente: clienteMap.get(c.clienteId) ?? null,
    }));
  }

  async obtenerPorId(id: string, empresaId: string) {
    const c = await this.creditoRepo.findOne({
      where: { id, empresaId },
      relations: ['cuotas', 'pagos'],
    });
    if (!c) throw new NotFoundException('Crédito no encontrado');
    return c;
  }

  async obtenerPorCliente(clienteId: string, empresaId: string) {
    return this.creditoRepo.find({
      where: { clienteId, empresaId },
      relations: ['cuotas'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CARTERA VENCIDA (aging report)
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerCarteraVencida(empresaId: string) {
    const hoy = new Date();
    const cuotas = await this.cuotaRepo
      .createQueryBuilder('cu')
      .leftJoinAndSelect('cu.credito', 'c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('cu.estado IN (:...estados)', {
        estados: [
          EstadoCuota.PENDIENTE,
          EstadoCuota.PAGO_PARCIAL,
          EstadoCuota.VENCIDA,
        ],
      })
      .orderBy('cu.fechaVencimiento', 'ASC')
      .getMany();

    const aging = {
      corriente: [] as any[],
      d30: [] as any[],
      d60: [] as any[],
      d90: [] as any[],
      d90mas: [] as any[],
    };

    cuotas.forEach((cu) => {
      const dias = Math.floor(
        (hoy.getTime() - new Date(cu.fechaVencimiento).getTime()) / 86400000,
      );
      const pendiente = cu.montoCuota - cu.montoPagado;
      const item = { cuota: cu, diasVencida: dias, montoPendiente: pendiente };
      if (dias <= 0) aging.corriente.push(item);
      else if (dias <= 30) aging.d30.push(item);
      else if (dias <= 60) aging.d60.push(item);
      else if (dias <= 90) aging.d90.push(item);
      else aging.d90mas.push(item);
    });

    // Enriquecer con clientes
    const todosIds = [
      ...aging.corriente,
      ...aging.d30,
      ...aging.d60,
      ...aging.d90,
      ...aging.d90mas,
    ]
      .map((i) => i.cuota.credito.clienteId)
      .filter(Boolean);
    const idsUnicos = [...new Set(todosIds)];
    if (idsUnicos.length) {
      // Mismo marcador de Postgres que en `enriquecerConClientes`, y sin
      // `.catch`: un reporte de cartera vencida sin nombres no es un reporte.
      const clientes: { id: string; nombre: string; rfc: string }[] =
        await this.dataSource.query(
          `SELECT id, nombre, rfc FROM clientes WHERE empresaId = $${idsUnicos.length + 1} AND id IN (${idsUnicos
            .map((_, i) => `$${i + 1}`)
            .join(',')})`,
          [...idsUnicos, empresaId],
        );
      const clienteMap = new Map(clientes.map((cl: any) => [cl.id, cl]));
      const enriquecer = (items: any[]) =>
        items.map((item) => ({
          ...item,
          cuota: {
            ...item.cuota,
            credito: {
              ...item.cuota.credito,
              cliente: clienteMap.get(item.cuota.credito.clienteId) ?? null,
            },
          },
        }));
      aging.corriente = enriquecer(aging.corriente);
      aging.d30 = enriquecer(aging.d30);
      aging.d60 = enriquecer(aging.d60);
      aging.d90 = enriquecer(aging.d90);
      aging.d90mas = enriquecer(aging.d90mas);
    }
    return aging;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────
  private redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private sumarMeses(fecha: Date, meses: number): Date {
    const d = new Date(fecha);
    d.setMonth(d.getMonth() + meses);
    return d;
  }

  /**
   * Traduce el producto al `enum` viejo, que sigue siendo columna obligatoria
   * de `creditos_clientes` y a la que apuntan los reportes existentes.
   *
   * Es un puente, no una clasificación: se retira cuando esos reportes lean el
   * producto. Mientras tanto, un producto a 45 días aterriza en el valor más
   * cercano y el dato bueno vive en `productocreditoid`.
   */
  private tipoHeredadoDe(producto: ProductoCredito): TipoCredito {
    const heredado = producto.tipoCreditoHeredado as TipoCredito | null;
    if (heredado && Object.values(TipoCredito).includes(heredado)) {
      return heredado;
    }
    if (producto.unidadPlazo === UnidadPlazo.MESES) {
      return TipoCredito.MENSUALIDADES;
    }
    if (producto.cadaCuantos <= 30) return TipoCredito.CREDITO_30D;
    if (producto.cadaCuantos <= 60) return TipoCredito.CREDITO_60D;
    return TipoCredito.CREDITO_90D;
  }

  private sumarDias(fecha: Date, dias: number): Date {
    const resultado = new Date(fecha);
    resultado.setDate(resultado.getDate() + dias);
    return resultado;
  }

  private fechaPorTipo(fecha: Date, tipo: TipoCredito): Date {
    const dias =
      tipo === TipoCredito.CREDITO_30D
        ? 30
        : tipo === TipoCredito.CREDITO_60D
          ? 60
          : tipo === TipoCredito.CREDITO_90D
            ? 90
            : 0;
    if (!dias) return this.sumarMeses(fecha, 1);
    const resultado = new Date(fecha);
    resultado.setDate(resultado.getDate() + dias);
    return resultado;
  }

  private async generarFolio(
    empresaId: string,
    manager?: EntityManager,
  ): Promise<string> {
    const año = new Date().getFullYear();
    const repo = manager
      ? manager.getRepository(CreditoCliente)
      : this.creditoRepo;
    const qb = repo
      .createQueryBuilder('c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.folio LIKE :p', { p: `CRD-${año}-%` })
      .orderBy('c.folio', 'DESC');
    if (manager) qb.setLock('pessimistic_write');
    const last = await qb.getOne();
    const seq = last ? parseInt(last.folio.split('-')[2]) + 1 : 1;
    return `CRD-${año}-${String(seq).padStart(4, '0')}`;
  }
}
