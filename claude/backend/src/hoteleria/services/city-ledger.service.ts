import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import { MetodoPagoCobranza } from '../../credito/dto/registrar-pago-cobranza.dto';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  CancelarConvenioHotelDto,
  CrearConvenioHotelDto,
  ReenviarConvenioHotelDto,
  RegistrarCobroCityLedgerDto,
  SuspenderConvenioHotelDto,
} from '../dto/city-ledger.dtos';
import {
  CobroCityLedger,
  ConvenioCreditoHotel,
  CuentaCobrarHotel,
  EstadoConvenioHotel,
  EstadoCuentaCityLedger,
  TipoConvenioHotel,
} from '../entities/city-ledger.entity';
import { Hotel } from '../entities/hotel.entity';
import { MetodoPagoHotel } from '../entities/folio.entity';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { AprobacionesDocumentosService } from '../../aprobaciones/services/aprobaciones-documentos.service';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';
import { PoliticaCreditoService } from '../../common/services/politica-credito.service';
import { existeAsignacionSegregada } from '../../compras/utils/rutas-aprobacion.util';

const money = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0) * 100) / 100;

const fechaIso = (fecha = new Date()) => fechaCalendarioNegocio(fecha);

const sumarDias = (fecha: string, dias: number) => {
  const resultado = new Date(`${fecha.slice(0, 10)}T12:00:00Z`);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString().slice(0, 10);
};

@Injectable()
export class CityLedgerService {
  private readonly logger = new Logger(CityLedgerService.name);

  constructor(
    @InjectRepository(ConvenioCreditoHotel)
    private readonly convenioRepo: Repository<ConvenioCreditoHotel>,
    @InjectRepository(CuentaCobrarHotel)
    private readonly cuentaRepo: Repository<CuentaCobrarHotel>,
    @InjectRepository(CobroCityLedger)
    private readonly cobroRepo: Repository<CobroCityLedger>,
    private readonly dataSource: DataSource,
    private readonly tesoreria: TesoreriaService,
    private readonly asientos: AsientosPendientesService,
    private readonly aprobaciones: AprobacionesDocumentosService,
    private readonly caja: CajaService,
    private readonly politicaCredito: PoliticaCreditoService,
  ) {}

  private calcularIvaReclasificado(
    importeCobrado: number,
    saldoAntes: number,
    importeOriginal: number,
    ivaOriginal: number,
    ivaYaReclasificado: number,
  ) {
    const restante = Math.max(0, money(ivaOriginal - ivaYaReclasificado));
    if (importeCobrado + 0.009 >= saldoAntes) return restante;
    if (importeOriginal <= 0) return 0;
    return Math.min(
      restante,
      money((importeCobrado * ivaOriginal) / importeOriginal),
    );
  }

  private validarVigenciaConvenio(
    vigenciaDesde: string,
    vigenciaHasta?: string | null,
  ) {
    if (!vigenciaDesde) {
      throw new BadRequestException('Indica la fecha inicial del convenio.');
    }
    if (vigenciaHasta && vigenciaHasta < vigenciaDesde) {
      throw new BadRequestException(
        'La vigencia final no puede ser anterior a la inicial.',
      );
    }
    if (vigenciaHasta && vigenciaHasta < fechaIso()) {
      throw new BadRequestException(
        'No se puede enviar a aprobación un convenio cuya vigencia ya terminó.',
      );
    }
  }

  private exigirGestorConvenio(rol: string) {
    const rolNormalizado = normalizarRol(rol);
    if (
      !esRolAdministrador(rol) &&
      !['FINANZAS', 'GERENCIA', 'DIRECCION'].includes(rolNormalizado)
    ) {
      throw new ForbiddenException(
        'Sólo Finanzas, Gerencia, Dirección o un administrador pueden suspender o cancelar convenios.',
      );
    }
  }

  private async marcarConveniosVencidos(empresaId: string, hotelId?: string) {
    const qb = this.convenioRepo
      .createQueryBuilder()
      .update(ConvenioCreditoHotel)
      .set({ estado: EstadoConvenioHotel.VENCIDO })
      .where('empresaId=:empresaId', { empresaId })
      .andWhere('estado=:estado', { estado: EstadoConvenioHotel.APROBADO })
      .andWhere('vigenciaHasta IS NOT NULL AND vigenciaHasta < :hoy', {
        hoy: fechaIso(),
      });
    if (hotelId) qb.andWhere('hotelId=:hotelId', { hotelId });
    await qb.execute();
  }

  async crearConvenio(
    dto: CrearConvenioHotelDto,
    empresaId: string,
    usuarioId: string,
  ) {
    this.validarVigenciaConvenio(dto.vigenciaDesde, dto.vigenciaHasta);
    const [hotel, cliente] = await Promise.all([
      this.dataSource.getRepository(Hotel).findOne({
        where: { id: dto.hotelId, empresaId, activo: true },
      }),
      this.dataSource.getRepository(Cliente).findOne({
        where: { id: dto.clienteId, empresaId, activo: true },
      }),
    ]);
    if (!hotel)
      throw new NotFoundException('El hotel no existe o está inactivo.');
    if (!cliente)
      throw new NotFoundException(
        'La empresa o agencia no existe como cliente activo.',
      );
    if (cliente.tipoPersona !== 'MORAL') {
      throw new BadRequestException(
        'Los convenios de empresa o agencia requieren un cliente de tipo persona moral.',
      );
    }
    if (!cliente.clasificacionHotelera) {
      throw new BadRequestException(
        'Clasifica al cliente como EMPRESA o AGENCIA en el catálogo de Clientes antes de solicitar el convenio.',
      );
    }
    if (cliente.estadoCredito !== 'AUTORIZADO') {
      throw new ConflictException(
        `Primero autoriza la línea maestra del cliente. Estado actual: ${cliente.estadoCredito}.`,
      );
    }
    if (
      Number(cliente.limiteCredito ?? 0) <= 0 ||
      Number(cliente.diasCredito ?? 0) <= 0
    ) {
      throw new ConflictException(
        'El cliente no tiene un límite y plazo de crédito autorizados.',
      );
    }
    await this.aprobaciones.exigirConfiguracion(
      empresaId,
      'HOTEL_CONVENIO',
      Number(cliente.limiteCredito),
    );

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const [candado] = await manager.query(
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
        [`HOTEL_CONVENIO:${empresaId}:${dto.hotelId}:${dto.clienteId}`],
      );
      if (Number(candado?.resultado ?? -999) < 0) {
        throw new ConflictException(
          'No fue posible reservar la creación del convenio. Intenta nuevamente.',
        );
      }

      const hotelActual = await manager.findOne(Hotel, {
        where: { id: dto.hotelId, empresaId, activo: true },
      });
      const clienteActual = await manager
        .getRepository(Cliente)
        .createQueryBuilder('cliente')
        .setLock('pessimistic_write')
        .where(
          'cliente.id=:clienteId AND cliente.empresaId=:empresaId AND cliente.activo=true',
          { clienteId: dto.clienteId, empresaId },
        )
        .getOne();
      if (!hotelActual) {
        throw new NotFoundException('El hotel no existe o está inactivo.');
      }
      if (!clienteActual) {
        throw new NotFoundException(
          'La empresa o agencia no existe como cliente activo.',
        );
      }
      if (
        clienteActual.tipoPersona !== 'MORAL' ||
        !clienteActual.clasificacionHotelera ||
        clienteActual.estadoCredito !== 'AUTORIZADO' ||
        clienteActual.estadoSolicitudCredito === 'PENDIENTE' ||
        Number(clienteActual.limiteCredito ?? 0) <= 0 ||
        Number(clienteActual.diasCredito ?? 0) <= 0
      ) {
        throw new ConflictException(
          'La línea maestra debe estar autorizada, estable y sin una propuesta de cambio pendiente antes de crear el convenio.',
        );
      }

      const repo = manager.getRepository(ConvenioCreditoHotel);
      const existente = await repo.findOne({
        where: {
          empresaId,
          hotelId: dto.hotelId,
          clienteId: dto.clienteId,
        },
      });
      if (existente) {
        throw new ConflictException(
          `Ya existe el convenio ${existente.numeroConvenio} para este cliente y hotel. Reactívalo o reenvíalo en lugar de duplicarlo.`,
        );
      }
      const numeroConvenio = dto.numeroConvenio.trim().toUpperCase();
      const numeroUsado = await repo.findOne({
        where: { empresaId, hotelId: dto.hotelId, numeroConvenio },
      });
      if (numeroUsado) {
        throw new ConflictException(
          'El número de convenio ya está asignado para este hotel.',
        );
      }

      const convenio = await repo.save(
        repo.create({
          empresaId,
          hotelId: dto.hotelId,
          clienteId: dto.clienteId,
          numeroConvenio,
          tipo: clienteActual.clasificacionHotelera as TipoConvenioHotel,
          nombreComercial:
            clienteActual.razonSocial?.trim() || clienteActual.nombre,
          // Snapshot auditable; nunca es una segunda línea editable.
          limiteCredito: Number(clienteActual.limiteCredito),
          diasCredito: Number(clienteActual.diasCredito),
          versionCreditoCliente: Number(clienteActual.versionCredito ?? 1),
          tolerancia: 0,
          bloquearConSaldoVencido:
            clienteActual.bloquearCreditoConSaldoVencido !== false,
          vigenciaDesde: dto.vigenciaDesde,
          vigenciaHasta: dto.vigenciaHasta ?? null,
          estado: EstadoConvenioHotel.PENDIENTE,
          solicitadoPorId: usuarioId,
          fechaSolicitud: new Date(),
          aprobadoPorId: null,
          fechaAprobacion: null,
          rechazadoPorId: null,
          fechaRechazo: null,
          suspendidoPorId: null,
          fechaSuspension: null,
          canceladoPorId: null,
          fechaCancelacion: null,
          comentarioResolucion: null,
          activo: true,
        }),
      );
      await this.aprobaciones.prepararEnTransaccion(manager, {
        proceso: 'HOTEL_CONVENIO',
        documentoId: convenio.id,
        empresaId,
        solicitadoPorId: usuarioId,
        monto: Number(clienteActual.limiteCredito),
        documentoVersion: Number(convenio.version ?? 1),
        datosSolicitud: {
          hotelId: convenio.hotelId,
          clienteId: convenio.clienteId,
          numeroConvenio: convenio.numeroConvenio,
          tipo: convenio.tipo,
          limiteCredito: Number(clienteActual.limiteCredito),
          diasCredito: Number(clienteActual.diasCredito),
          versionCreditoCliente: Number(clienteActual.versionCredito ?? 1),
          bloquearConSaldoVencido:
            clienteActual.bloquearCreditoConSaldoVencido !== false,
          vigenciaDesde: convenio.vigenciaDesde,
          vigenciaHasta: convenio.vigenciaHasta,
          },
      });
      return convenio;
    });
  }

  async suspenderConvenio(
    id: string,
    dto: SuspenderConvenioHotelDto,
    empresaId: string,
    usuarioId: string,
    rol: string,
  ) {
    this.exigirGestorConvenio(rol);
    return this.dataSource.transaction(async (manager) => {
      const convenio = await manager
        .getRepository(ConvenioCreditoHotel)
        .createQueryBuilder('convenio')
        .setLock('pessimistic_write')
        .where('convenio.id=:id AND convenio.empresaId=:empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!convenio) throw new NotFoundException('Convenio no encontrado.');
      if (convenio.estado !== EstadoConvenioHotel.APROBADO) {
        throw new ConflictException(
          'Sólo un convenio aprobado puede suspenderse.',
        );
      }
      convenio.estado = EstadoConvenioHotel.SUSPENDIDO;
      convenio.comentarioResolucion = dto.comentario.trim();
      convenio.suspendidoPorId = usuarioId;
      convenio.fechaSuspension = new Date();
      return manager.getRepository(ConvenioCreditoHotel).save(convenio);
    });
  }

  async reenviarConvenio(
    id: string,
    dto: ReenviarConvenioHotelDto,
    empresaId: string,
    usuarioId: string,
  ) {
    const cambios = dto ?? ({} as ReenviarConvenioHotelDto);
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repo = manager.getRepository(ConvenioCreditoHotel);
      const convenio = await repo
        .createQueryBuilder('convenio')
        .setLock('pessimistic_write')
        .where('convenio.id=:id AND convenio.empresaId=:empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!convenio) throw new NotFoundException('Convenio no encontrado.');

      if (
        convenio.estado === EstadoConvenioHotel.APROBADO &&
        convenio.vigenciaHasta &&
        convenio.vigenciaHasta < fechaIso()
      ) {
        convenio.estado = EstadoConvenioHotel.VENCIDO;
      }

      if (
        ![
          EstadoConvenioHotel.RECHAZADO,
          EstadoConvenioHotel.SUSPENDIDO,
          EstadoConvenioHotel.VENCIDO,
          EstadoConvenioHotel.CANCELADO,
        ].includes(convenio.estado)
      ) {
        throw new ConflictException(
          'Sólo un convenio rechazado, suspendido, vencido o cancelado puede enviarse nuevamente a aprobación.',
        );
      }

      const requiereRenovacion =
        [EstadoConvenioHotel.VENCIDO, EstadoConvenioHotel.CANCELADO].includes(
          convenio.estado,
        ) ||
        Boolean(convenio.vigenciaHasta && convenio.vigenciaHasta < fechaIso());
      if (requiereRenovacion && !cambios.vigenciaDesde) {
        throw new BadRequestException(
          'Para renovar un convenio vencido o cancelado indica una nueva fecha inicial.',
        );
      }

      const vigenciaDesde = cambios.vigenciaDesde ?? convenio.vigenciaDesde;
      const vigenciaHasta =
        cambios.vigenciaHasta !== undefined
          ? cambios.vigenciaHasta || null
          : convenio.vigenciaHasta;
      this.validarVigenciaConvenio(vigenciaDesde, vigenciaHasta);

      const cliente = await manager.findOne(Cliente, {
        where: { id: convenio.clienteId, empresaId, activo: true },
      });
      if (
        !cliente ||
        cliente.estadoCredito !== 'AUTORIZADO' ||
        cliente.estadoSolicitudCredito === 'PENDIENTE'
      ) {
        throw new ConflictException(
          'La línea maestra debe estar autorizada y sin cambios pendientes antes de reenviar el convenio.',
        );
      }
      if (cliente.tipoPersona !== 'MORAL' || !cliente.clasificacionHotelera) {
        throw new ConflictException(
          'Clasifica al cliente como EMPRESA o AGENCIA antes de reenviar el convenio.',
        );
      }
      const hotel = await manager.findOne(Hotel, {
        where: { id: convenio.hotelId, empresaId, activo: true },
      });
      if (!hotel) {
        throw new ConflictException(
          'El hotel del convenio está inactivo o ya no existe.',
        );
      }

      const numeroConvenio = (cambios.numeroConvenio ?? convenio.numeroConvenio)
        .trim()
        .toUpperCase();
      const numeroUsado = await repo
        .createQueryBuilder('otro')
        .where(
          'otro.empresaId=:empresaId AND otro.hotelId=:hotelId AND otro.numeroConvenio=:numeroConvenio AND otro.id<>:id',
          {
            empresaId,
            hotelId: convenio.hotelId,
            numeroConvenio,
            id: convenio.id,
          },
        )
        .getOne();
      if (numeroUsado) {
        throw new ConflictException(
          'El número de convenio ya está asignado a otro cliente de este hotel.',
        );
      }

      await this.aprobaciones.cancelarPendientesEnTransaccion(
        manager,
        empresaId,
        'HOTEL_CONVENIO',
        convenio.id,
        'Ciclo anterior cancelado al reenviar o renovar el convenio.',
      );

      convenio.numeroConvenio = numeroConvenio;
      convenio.vigenciaDesde = vigenciaDesde;
      convenio.vigenciaHasta = vigenciaHasta;
      convenio.estado = EstadoConvenioHotel.PENDIENTE;
      convenio.tipo = cliente.clasificacionHotelera as TipoConvenioHotel;
      convenio.nombreComercial = cliente.razonSocial?.trim() || cliente.nombre;
      convenio.limiteCredito = Number(cliente.limiteCredito);
      convenio.diasCredito = Number(cliente.diasCredito);
      convenio.versionCreditoCliente = Number(cliente.versionCredito ?? 1);
      convenio.bloquearConSaldoVencido =
        cliente.bloquearCreditoConSaldoVencido !== false;
      convenio.tolerancia = 0;
      convenio.solicitadoPorId = usuarioId;
      convenio.fechaSolicitud = new Date();
      convenio.aprobadoPorId = null;
      convenio.fechaAprobacion = null;
      convenio.rechazadoPorId = null;
      convenio.fechaRechazo = null;
      convenio.suspendidoPorId = null;
      convenio.fechaSuspension = null;
      convenio.canceladoPorId = null;
      convenio.fechaCancelacion = null;
      convenio.comentarioResolucion = null;
      convenio.activo = true;
      await repo.save(convenio);

      await this.aprobaciones.prepararEnTransaccion(manager, {
        proceso: 'HOTEL_CONVENIO',
        documentoId: convenio.id,
        empresaId,
        solicitadoPorId: usuarioId,
        monto: Number(cliente.limiteCredito),
        documentoVersion: Number(convenio.version ?? 1),
        datosSolicitud: {
          hotelId: convenio.hotelId,
          clienteId: convenio.clienteId,
          numeroConvenio: convenio.numeroConvenio,
          tipo: convenio.tipo,
          limiteCredito: Number(cliente.limiteCredito),
          diasCredito: Number(cliente.diasCredito),
          versionCreditoCliente: Number(cliente.versionCredito ?? 1),
          bloquearConSaldoVencido:
            cliente.bloquearCreditoConSaldoVencido !== false,
          vigenciaDesde: convenio.vigenciaDesde,
          vigenciaHasta: convenio.vigenciaHasta,
        },
      });
      return convenio;
    });
  }

  async cancelarConvenio(
    id: string,
    dto: CancelarConvenioHotelDto,
    empresaId: string,
    usuarioId: string,
    rol: string,
  ) {
    this.exigirGestorConvenio(rol);
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repo = manager.getRepository(ConvenioCreditoHotel);
      const convenio = await repo
        .createQueryBuilder('convenio')
        .setLock('pessimistic_write')
        .where('convenio.id=:id AND convenio.empresaId=:empresaId', {
          id,
          empresaId,
        })
        .getOne();
      if (!convenio) throw new NotFoundException('Convenio no encontrado.');
      if (convenio.estado === EstadoConvenioHotel.CANCELADO) {
        throw new ConflictException('El convenio ya está cancelado.');
      }

      await this.aprobaciones.cancelarPendientesEnTransaccion(
        manager,
        empresaId,
        'HOTEL_CONVENIO',
        convenio.id,
        `Convenio cancelado: ${dto.motivo}`,
      );
      convenio.estado = EstadoConvenioHotel.CANCELADO;
      convenio.canceladoPorId = usuarioId;
      convenio.fechaCancelacion = new Date();
      convenio.comentarioResolucion = dto.motivo.trim();
      convenio.activo = false;
      return repo.save(convenio);
    });
  }

  async listarConvenios(empresaId: string, hotelId?: string) {
    await this.marcarConveniosVencidos(empresaId, hotelId);
    const convenios = await this.convenioRepo.find({
      where: { empresaId, ...(hotelId ? { hotelId } : {}) },
      order: { fechaCreacion: 'DESC' },
    });
    if (!convenios.length) return [];

    const clienteIds = [...new Set(convenios.map((item) => item.clienteId))];
    const clientes = await this.dataSource
      .getRepository(Cliente)
      .createQueryBuilder('cliente')
      .where('cliente.empresaId=:empresaId', { empresaId })
      .andWhere('cliente.id IN (:...clienteIds)', { clienteIds })
      .getMany();
    const porCliente = new Map<string, Cliente>(
      clientes.map(
        (item): [string, Cliente] => [String(item.id), item],
      ),
    );

    const exposiciones = await this.dataSource.query(
      `SELECT base.clienteId,
              COALESCE(hotel.saldo,0) saldoHotel,
              COALESCE(venta.saldo,0) saldoVentas
         FROM (SELECT DISTINCT clienteId FROM hoteleria_convenios_credito WHERE empresaId=$1) base
         LEFT JOIN (
           SELECT clienteId, SUM(saldoPendiente) saldo
             FROM hoteleria_city_ledger_cuentas
            WHERE empresaId=$1 AND estado IN ('ABIERTA','VENCIDA')
            GROUP BY clienteId
         ) hotel ON hotel.clienteId=base.clienteId
         LEFT JOIN (
           SELECT clienteId, SUM(saldoPendiente) saldo
             FROM creditos_clientes
            WHERE empresaId=$1 AND estado IN ('ACTIVO','VENCIDO')
            GROUP BY clienteId
         ) venta ON venta.clienteId=base.clienteId`,
      [empresaId],
    );
    const exposicionPorCliente = new Map<string, number>(
      exposiciones.map(
        (fila: any): [string, number] => [
          String(fila.clienteId),
          money(Number(fila.saldoHotel ?? 0) + Number(fila.saldoVentas ?? 0)),
        ],
      ),
    );
    const saldosConvenio = await this.cuentaRepo
      .createQueryBuilder('cuenta')
      .select('cuenta.convenioId', 'convenioId')
      .addSelect('SUM(cuenta.saldoPendiente)', 'saldo')
      .where('cuenta.empresaId=:empresaId', { empresaId })
      .andWhere('cuenta.estado IN (:...estados)', {
        estados: [
          EstadoCuentaCityLedger.ABIERTA,
          EstadoCuentaCityLedger.VENCIDA,
        ],
      })
      .groupBy('cuenta.convenioId')
      .getRawMany<{ convenioId: string; saldo: string }>();
    const porConvenio = new Map<string, number>(
      saldosConvenio.map(
        (fila): [string, number] => [
          String(fila.convenioId),
          money(fila.saldo),
        ],
      ),
    );

    return convenios.map((convenio) => {
      const cliente = porCliente.get(String(convenio.clienteId));
      const limite = money(cliente?.limiteCredito ?? convenio.limiteCredito);
      const dias = Number(cliente?.diasCredito ?? convenio.diasCredito);
      const saldoGlobal =
        exposicionPorCliente.get(String(convenio.clienteId)) ?? 0;
      return {
        ...convenio,
        // No se sobrescribe el snapshot del convenio. La interfaz recibe por
        // separado la línea maestra vigente y la evidencia histórica.
        limiteCreditoSnapshot: Number(convenio.limiteCredito),
        diasCreditoSnapshot: Number(convenio.diasCredito),
        limiteCreditoVigente: limite,
        diasCreditoVigente: dias,
        estadoCreditoCliente: cliente?.estadoCredito ?? 'NO_DISPONIBLE',
        nivelRiesgoCliente: cliente?.nivelRiesgo ?? null,
        clasificacionHoteleraCliente:
          cliente?.clasificacionHotelera ?? null,
        bloquearConSaldoVencido:
          cliente?.bloquearCreditoConSaldoVencido !== false,
        clienteActivo: cliente?.activo ?? false,
        versionCreditoClienteActual: Number(cliente?.versionCredito ?? 1),
        condicionesCreditoVigentes:
          Number(convenio.versionCreditoCliente ?? 1) ===
          Number(cliente?.versionCredito ?? 1),
        saldoUtilizado: porConvenio.get(String(convenio.id)) ?? 0,
        saldoUtilizadoGlobal: saldoGlobal,
        creditoDisponible: money(Math.max(0, limite - saldoGlobal)),
      };
    });
  }

  async listarCartera(empresaId: string, convenioId?: string) {
    const hoy = fechaIso();
    const cuentas = await this.cuentaRepo.find({
      where: { empresaId, ...(convenioId ? { convenioId } : {}) },
      order: { fechaVencimiento: 'ASC', fechaCreacion: 'ASC' },
    });
    return cuentas.map((cuenta) => {
      const diasVencidos =
        Number(cuenta.saldoPendiente) > 0 && cuenta.fechaVencimiento < hoy
          ? Math.floor(
              (Date.parse(`${hoy}T00:00:00Z`) -
                Date.parse(`${cuenta.fechaVencimiento}T00:00:00Z`)) /
                86_400_000,
            )
          : 0;
      return {
        ...cuenta,
        diasVencidos,
        bandaAntiguedad:
          diasVencidos <= 0
            ? 'CORRIENTE'
            : diasVencidos <= 30
              ? '1_30'
              : diasVencidos <= 60
                ? '31_60'
                : diasVencidos <= 90
                  ? '61_90'
                  : 'MAS_90',
      };
    });
  }

  async crearCuentaDesdeCheckout(
    manager: EntityManager,
    datos: {
      empresaId: string;
      hotelId: string;
      reservacionId: string;
      huespedClienteId: string;
      folioId: string;
      folioReferencia: string;
      convenioId: string;
      metodoPago: MetodoPagoHotel;
      moneda: string;
      subtotal: number;
      iva: number;
      impuestoHospedaje: number;
      total: number;
      fechaEmision: string;
    },
  ) {
    // La preparación global se consulta desde el diagnóstico administrativo.
    // El checkout valida únicamente sus dependencias locales dentro de la
    // transacción; una anomalía histórica ajena no debe bloquear una estancia.
    const tipoEsperado =
      datos.metodoPago === MetodoPagoHotel.CREDITO_EMPRESA
        ? TipoConvenioHotel.EMPRESA
        : datos.metodoPago === MetodoPagoHotel.CREDITO_AGENCIA
          ? TipoConvenioHotel.AGENCIA
          : null;
    if (!tipoEsperado) {
      throw new BadRequestException(
        'El método seleccionado no es crédito hotelero.',
      );
    }
    const convenio = await manager
      .getRepository(ConvenioCreditoHotel)
      .createQueryBuilder('convenio')
      .setLock('pessimistic_write')
      .where('convenio.id=:id AND convenio.empresaId=:empresaId', {
        id: datos.convenioId,
        empresaId: datos.empresaId,
      })
      .getOne();
    if (!convenio || !convenio.activo) {
      throw new NotFoundException(
        'El convenio de crédito no existe o está inactivo.',
      );
    }
    if (
      convenio.hotelId !== datos.hotelId ||
      convenio.tipo !== tipoEsperado ||
      convenio.estado !== EstadoConvenioHotel.APROBADO
    ) {
      throw new ConflictException(
        'El convenio no está aprobado o no corresponde al hotel y tipo de crédito.',
      );
    }
    if (
      datos.fechaEmision < convenio.vigenciaDesde ||
      (convenio.vigenciaHasta && datos.fechaEmision > convenio.vigenciaHasta)
    ) {
      throw new ConflictException(
        'El convenio no está vigente para la fecha del cierre.',
      );
    }
    const cuentaExistente = await manager
      .getRepository(CuentaCobrarHotel)
      .findOne({
        where: { empresaId: datos.empresaId, folioId: datos.folioId },
      });
    if (cuentaExistente) return cuentaExistente;
    const politica = await this.politicaCredito.validarOperacionEnTransaccion(
      manager,
      {
        empresaId: datos.empresaId,
        clienteId: convenio.clienteId,
        importe: datos.total,
        fechaCorte: datos.fechaEmision,
      },
    );
    if (
      Number(convenio.versionCreditoCliente ?? 1) !==
      Number(politica.versionCredito ?? 1)
    ) {
      throw new ConflictException(
        'La línea maestra cambió después de aprobar el convenio. Reenvía el convenio a aprobación.',
      );
    }
    const diasCliente = politica.diasCredito;
    return manager.getRepository(CuentaCobrarHotel).save(
      manager.getRepository(CuentaCobrarHotel).create({
        empresaId: datos.empresaId,
        hotelId: datos.hotelId,
        convenioId: convenio.id,
        convenioVersion: Number(convenio.version ?? 1),
        numeroConvenioSnapshot: convenio.numeroConvenio,
        tipoConvenioSnapshot: convenio.tipo,
        limiteCreditoAplicado: Number(politica.limite),
        diasCreditoAplicados: Number(politica.diasCredito),
        versionCreditoClienteAplicada: Number(politica.versionCredito ?? 1),
        clienteId: convenio.clienteId,
        folioId: datos.folioId,
        reservacionId: datos.reservacionId,
        folioReferencia: datos.folioReferencia,
        moneda: datos.moneda,
        subtotal: money(datos.subtotal),
        ivaOriginal: money(datos.iva),
        impuestoHospedaje: money(datos.impuestoHospedaje),
        importeOriginal: money(datos.total),
        saldoPendiente: money(datos.total),
        ivaReclasificado: 0,
        fechaEmision: datos.fechaEmision,
        fechaVencimiento: sumarDias(datos.fechaEmision, diasCliente),
        estado: EstadoCuentaCityLedger.ABIERTA,
      }),
    );
  }

  async registrarCobro(
    dto: RegistrarCobroCityLedgerDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    const importe = money(dto.importe);
    const resultado = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const previo = await manager.getRepository(CobroCityLedger).findOne({
          where: { empresaId, claveIdempotencia: dto.claveIdempotencia },
        });
        if (previo) return { cobro: previo, idempotente: true };
        const cuenta = await manager
          .getRepository(CuentaCobrarHotel)
          .createQueryBuilder('cuenta')
          .setLock('pessimistic_write')
          .where('cuenta.id=:id AND cuenta.empresaId=:empresaId', {
            id: dto.cuentaCobrarId,
            empresaId,
          })
          .getOne();
        if (!cuenta)
          throw new NotFoundException('Cuenta por cobrar no encontrada.');
        if (
          [
            EstadoCuentaCityLedger.LIQUIDADA,
            EstadoCuentaCityLedger.CANCELADA,
          ].includes(cuenta.estado)
        ) {
          throw new ConflictException('La cuenta ya no admite cobros.');
        }
        if (importe - Number(cuenta.saldoPendiente) > 0.009) {
          throw new BadRequestException(
            `El cobro excede el saldo de ${Number(cuenta.saldoPendiente).toFixed(2)}.`,
          );
        }
        const bancaria = await manager.getRepository(CuentaBancaria).findOne({
          where: { id: dto.cuentaBancariaId, empresaId, activo: true },
        });
        if (!bancaria)
          throw new NotFoundException(
            'Cuenta financiera inexistente o inactiva.',
          );
        const tipoEsperadoPorMetodo: Partial<
          Record<MetodoPagoCobranza, TipoCuentaBancaria>
        > = {
          [MetodoPagoCobranza.EFECTIVO]: TipoCuentaBancaria.CAJA,
          [MetodoPagoCobranza.TARJETA]: TipoCuentaBancaria.TPV,
          [MetodoPagoCobranza.TRANSFERENCIA]: TipoCuentaBancaria.BANCO,
          [MetodoPagoCobranza.CHEQUE]: TipoCuentaBancaria.BANCO,
        };
        const tipoEsperado = tipoEsperadoPorMetodo[dto.metodoPago];
        if (tipoEsperado && bancaria.tipo !== tipoEsperado) {
          throw new BadRequestException(
            `${dto.metodoPago} debe recibirse en una cuenta de tipo ${tipoEsperado}.`,
          );
        }
        if (
          [
            MetodoPagoCobranza.TARJETA,
            MetodoPagoCobranza.TRANSFERENCIA,
            MetodoPagoCobranza.CHEQUE,
          ].includes(dto.metodoPago) &&
          !dto.referencia?.trim()
        ) {
          throw new BadRequestException(
            `${dto.metodoPago} requiere referencia.`,
          );
        }
        const saldoAntes = money(cuenta.saldoPendiente);
        const ivaReclasificado = this.calcularIvaReclasificado(
          importe,
          saldoAntes,
          Number(cuenta.importeOriginal),
          Number(cuenta.ivaOriginal),
          Number(cuenta.ivaReclasificado),
        );
        cuenta.saldoPendiente = money(saldoAntes - importe);
        cuenta.ivaReclasificado = money(
          Number(cuenta.ivaReclasificado) + ivaReclasificado,
        );
        cuenta.estado =
          Number(cuenta.saldoPendiente) <= 0.009
            ? EstadoCuentaCityLedger.LIQUIDADA
            : cuenta.fechaVencimiento < fechaIso()
              ? EstadoCuentaCityLedger.VENCIDA
              : EstadoCuentaCityLedger.ABIERTA;
        await manager.getRepository(CuentaCobrarHotel).save(cuenta);
        const cobroRepo = manager.getRepository(CobroCityLedger);
        const cobro = await cobroRepo.save(
          cobroRepo.create({
            empresaId,
            cuentaCobrarId: cuenta.id,
            fechaPago: dto.fechaPago?.slice(0, 10) ?? fechaIso(),
            importe,
            ivaReclasificado,
            metodoPago: dto.metodoPago,
            cuentaBancariaId: dto.cuentaBancariaId,
            referencia: dto.referencia?.trim() || null,
            claveIdempotencia: dto.claveIdempotencia,
            movimientoTesoreriaId: null,
            asientoPendienteId: null,
            polizaId: null,
            estadoContable: 'PENDIENTE',
            registradoPorId: usuarioId ?? null,
          }),
        );
        const movimiento = await this.tesoreria.registrarEnTransaccion(
          {
            cuentaBancariaId: dto.cuentaBancariaId,
            fecha: cobro.fechaPago,
            tipo: TipoMovimiento.INGRESO,
            importe,
            concepto: `Cobro City Ledger ${cuenta.folioReferencia}`,
            origen: OrigenMovimiento.COBRANZA,
            referencia: dto.referencia,
            documentoId: cobro.id,
            tipoDocumento: 'COBRO_CITY_LEDGER',
            terceroId: cuenta.clienteId,
          },
          empresaId,
          usuarioId,
          manager,
        );
        cobro.movimientoTesoreriaId = movimiento?.id ?? null;
        if (bancaria.tipo === TipoCuentaBancaria.CAJA) {
          await this.caja.registrarEnTransaccion(
            manager,
            {
              cuentaCajaId: bancaria.id,
              naturaleza: NaturalezaMovimientoCaja.ENTRADA,
              tipo: TipoMovimientoCaja.COBRANZA,
              importe,
              concepto: `Cobro City Ledger ${cuenta.folioReferencia}`,
              referencia: dto.referencia,
              documentoId: cobro.id,
              tipoDocumento: 'COBRO_CITY_LEDGER',
            },
            empresaId,
            usuarioId,
          );
        }
        const evento = await this.asientos.encolarEnTransaccion(
          manager,
          TipoAsiento.COBRANZA,
          {
            pagoId: cobro.id,
            creditoId: cuenta.id,
            clienteId: cuenta.clienteId,
            fechaPago: new Date(`${cobro.fechaPago}T12:00:00`),
            empresaId,
            montoCapital: importe,
            montoInteres: 0,
            ivaReclasificado,
            totalPagado: importe,
            cuentaBancariaId: dto.cuentaBancariaId,
          },
          empresaId,
          `CITY-${cuenta.folioReferencia}`,
          cobro.id,
        );
        cobro.asientoPendienteId = evento.id;
        await cobroRepo.save(cobro);
        return { cobro, idempotente: false };
      },
    );
    const advertencias: string[] = [];
    if (!resultado.idempotente && resultado.cobro.asientoPendienteId) {
      try {
        const asiento = await this.asientos.reintentarAhora(
          resultado.cobro.asientoPendienteId,
          empresaId,
        );
        await this.cobroRepo.update(
          { id: resultado.cobro.id, empresaId },
          {
            estadoContable: asiento.generado ? 'GENERADO' : 'PENDIENTE',
            polizaId: asiento.polizaId ?? null,
          },
        );
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `El cobro City Ledger ${resultado.cobro.id} quedó confirmado, pero su póliza sigue pendiente: ${mensaje}`,
        );
        advertencias.push(
          'El cobro quedó registrado; la póliza contable se reintentará automáticamente.',
        );
      }
    }
    return {
      idempotente: resultado.idempotente,
      cobro: await this.cobroRepo.findOne({
        where: { id: resultado.cobro.id, empresaId },
      }),
      advertencias,
    };
  }

  listarCobros(cuentaCobrarId: string, empresaId: string) {
    return this.cobroRepo.find({
      where: { cuentaCobrarId, empresaId },
      order: { fechaPago: 'DESC', fechaCreacion: 'DESC' },
    });
  }

  async diagnosticoHistorico(empresaId: string) {
    const filas = await this.dataSource.query(
      `SELECT f.id folioId, r.codigo reservacion, f.total, f.totalCobrado,
              f.saldoPendiente, f.estadoContable, p.metodoPago,
              CASE WHEN cl.id IS NULL THEN 0 ELSE 1 END tieneCityLedger,
              ap.estado estadoAsiento, ap.polizaId
         FROM folios f
         INNER JOIN reservaciones r ON r.id=f.reservacionId AND r.empresaId=f.empresaId
         INNER JOIN pagos_folio_hotel p ON p.folioId=f.id AND p.empresaId=f.empresaId
         LEFT JOIN hoteleria_city_ledger_cuentas cl ON cl.folioId=f.id AND cl.empresaId=f.empresaId
         LEFT JOIN asientos_pendientes ap ON ap.id=f.asientoPendienteId AND ap.empresaId=f.empresaId
        WHERE f.empresaId=$1 AND p.metodoPago IN ('CREDITO_EMPRESA','CREDITO_AGENCIA')
        ORDER BY f.fechaCierre DESC`,
      [empresaId],
    );
    return {
      totalFoliosCredito: filas.length,
      sinCityLedger: filas.filter((fila: any) => !fila.tieneCityLedger).length,
      conPolizaGenerada: filas.filter(
        (fila: any) => fila.estadoAsiento === 'GENERADO',
      ).length,
      pendientesContables: filas.filter(
        (fila: any) => fila.estadoAsiento !== 'GENERADO',
      ).length,
      filas,
      advertencia:
        'Diagnóstico de sólo lectura. No reclasifica pólizas ni crea cuentas por cobrar automáticamente.',
    };
  }

  async verificarPreparacionProduccion(empresaId: string) {
    const objetos = await this.dataSource.query(
      `SELECT
         CASE WHEN to_regclass('hoteleria_convenios_credito') IS NULL THEN 0 ELSE 1 END convenios,
         CASE WHEN to_regclass('hoteles') IS NULL THEN 0 ELSE 1 END hoteles,
         CASE WHEN to_regclass('hoteleria_city_ledger_cuentas') IS NULL THEN 0 ELSE 1 END cartera,
         CASE WHEN to_regclass('hoteleria_city_ledger_cobros') IS NULL THEN 0 ELSE 1 END cobros,
         CASE WHEN to_regclass('aprobaciones_documentos') IS NULL THEN 0 ELSE 1 END aprobaciones,
         CASE WHEN to_regclass('configuraciones_aprobacion') IS NULL THEN 0 ELSE 1 END matrices,
         CASE WHEN to_regclass('Usuarios') IS NULL THEN 0 ELSE 1 END usuarios,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('folios') AND column_name=LOWER('totalCredito')) THEN 0 ELSE 1 END totalCredito,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('folios') AND column_name=LOWER('cuentaCobrarHotelId')) THEN 0 ELSE 1 END enlaceCuenta,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('pagos_folio_hotel') AND column_name=LOWER('convenioId')) THEN 0 ELSE 1 END enlaceConvenio,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('versionCredito')) THEN 0 ELSE 1 END versionCredito,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('clasificacionHotelera')) THEN 0 ELSE 1 END clasificacionHotelera,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('bloquearCreditoConSaldoVencido')) THEN 0 ELSE 1 END politicaVencidos,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('estadoSolicitudCredito')) THEN 0 ELSE 1 END estadoSolicitudCredito,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('limiteCreditoSolicitado')) THEN 0 ELSE 1 END limiteCreditoSolicitado,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('diasCreditoSolicitados')) THEN 0 ELSE 1 END diasCreditoSolicitados,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('clientes') AND column_name=LOWER('versionSolicitudCredito')) THEN 0 ELSE 1 END versionSolicitudCredito,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_convenios_credito') AND column_name=LOWER('versionCreditoCliente')) THEN 0 ELSE 1 END versionConvenioCredito,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('aprobaciones_documentos') AND column_name=LOWER('documentoVersion')) THEN 0 ELSE 1 END versionAprobacion,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('aprobaciones_documentos') AND column_name=LOWER('datosSolicitud')) THEN 0 ELSE 1 END snapshotAprobacion,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_city_ledger_cuentas') AND column_name=LOWER('convenioVersion')) THEN 0 ELSE 1 END cuentaConvenioVersion,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_city_ledger_cuentas') AND column_name=LOWER('numeroConvenioSnapshot')) THEN 0 ELSE 1 END cuentaNumeroConvenioSnapshot,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_city_ledger_cuentas') AND column_name=LOWER('tipoConvenioSnapshot')) THEN 0 ELSE 1 END cuentaTipoConvenioSnapshot,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_city_ledger_cuentas') AND column_name=LOWER('limiteCreditoAplicado')) THEN 0 ELSE 1 END cuentaLimiteCreditoAplicado,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_city_ledger_cuentas') AND column_name=LOWER('diasCreditoAplicados')) THEN 0 ELSE 1 END cuentaDiasCreditoAplicados,
         CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('hoteleria_city_ledger_cuentas') AND column_name=LOWER('versionCreditoClienteAplicada')) THEN 0 ELSE 1 END cuentaVersionCreditoAplicada`,
    );
    const esquema = objetos?.[0] ?? {};
    const bloqueos: string[] = [];
    const requeridos: Array<[string, string]> = [
      ['convenios', 'Falta la tabla de convenios hoteleros.'],
      ['hoteles', 'Falta la tabla maestra de hoteles.'],
      ['cartera', 'Falta la tabla de cuentas por cobrar del City Ledger.'],
      ['cobros', 'Falta la tabla de cobros del City Ledger.'],
      ['aprobaciones', 'Falta la bandeja central de aprobaciones.'],
      ['matrices', 'Falta la configuración de flujos de aprobación.'],
      ['usuarios', 'Falta la tabla de usuarios necesaria para validar la segregación de aprobadores.'],
      ['totalCredito', 'Falta folios.totalCredito.'],
      ['enlaceCuenta', 'Falta folios.cuentaCobrarHotelId.'],
      ['enlaceConvenio', 'Falta pagos_folio_hotel.convenioId.'],
      ['versionCredito', 'Falta clientes.versionCredito.'],
      ['clasificacionHotelera', 'Falta clientes.clasificacionHotelera.'],
      ['politicaVencidos', 'Falta la política maestra de bloqueo por vencimiento.'],
      ['estadoSolicitudCredito', 'Falta separar el estado operativo de la línea y el estado maker-checker de la propuesta.'],
      ['limiteCreditoSolicitado', 'Falta clientes.limiteCreditoSolicitado.'],
      ['diasCreditoSolicitados', 'Falta clientes.diasCreditoSolicitados.'],
      ['versionSolicitudCredito', 'Falta clientes.versionSolicitudCredito.'],
      ['versionConvenioCredito', 'Falta la versión de crédito en convenios.'],
      ['versionAprobacion', 'Falta la versión del documento aprobado.'],
      ['snapshotAprobacion', 'Falta el snapshot de condiciones aprobadas.'],
      ['cuentaConvenioVersion', 'Falta fijar en cada cuenta City Ledger la versión exacta del convenio aplicado.'],
      ['cuentaNumeroConvenioSnapshot', 'Falta conservar el número de convenio histórico en cada cuenta City Ledger.'],
      ['cuentaTipoConvenioSnapshot', 'Falta conservar el tipo de convenio histórico en cada cuenta City Ledger.'],
      ['cuentaLimiteCreditoAplicado', 'Falta conservar la línea maestra aplicada al originar cada cuenta City Ledger.'],
      ['cuentaDiasCreditoAplicados', 'Falta conservar el plazo aplicado al originar cada cuenta City Ledger.'],
      ['cuentaVersionCreditoAplicada', 'Falta conservar la versión de crédito maestra aplicada a cada cuenta City Ledger.'],
    ];
    for (const [campo, mensaje] of requeridos) {
      if (!Number(esquema[campo])) bloqueos.push(mensaje);
    }

    const matrices = Number(esquema.matrices)
      ? await this.dataSource.query(
          `;WITH niveles AS (
             SELECT proceso,orden,montoDesde,montoHasta,departamentoId,
                    obligatorio,permiteAutoaprobacion,usuarioId,rolAprobador,
                    MAX(orden) OVER(PARTITION BY proceso) ultimoOrden
               FROM configuraciones_aprobacion
              WHERE empresaId=$1 AND activo=true
                AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
           )
           SELECT proceso,
                  COUNT(*) niveles,
                  SUM(CASE WHEN departamentoId IS NOT NULL THEN 1 ELSE 0 END) conDepartamento,
                  SUM(CASE WHEN obligatorio=false OR permiteAutoaprobacion=true THEN 1 ELSE 0 END) controlesInvalidos,
                  SUM(CASE WHEN (usuarioId IS NULL AND rolAprobador IS NULL) OR
                                     (usuarioId IS NOT NULL AND rolAprobador IS NOT NULL)
                           THEN 1 ELSE 0 END) responsablesInvalidos,
                  SUM(CASE WHEN orden=ultimoOrden AND montoHasta IS NOT NULL THEN 1 ELSE 0 END) ultimoConTope,
                  SUM(CASE WHEN orden<ultimoOrden AND montoHasta IS NULL THEN 1 ELSE 0 END) intermediosSinTope
             FROM niveles
            GROUP BY proceso`,
          [empresaId],
        )
      : [];
    for (const proceso of ['CREDITO_CLIENTE', 'HOTEL_CONVENIO']) {
      const matriz = matrices.find((item: any) => item.proceso === proceso);
      if (!matriz || Number(matriz.niveles) < 1) {
        bloqueos.push(`Configura al menos un nivel activo para ${proceso}.`);
        continue;
      }
      if (
        Number(matriz.conDepartamento) ||
        Number(matriz.controlesInvalidos) ||
        Number(matriz.responsablesInvalidos) ||
        Number(matriz.ultimoConTope) ||
        Number(matriz.intermediosSinTope)
      ) {
        bloqueos.push(
          `La matriz ${proceso} no cumple el gobierno financiero: debe ser global, obligatoria, sin autoaprobación, con un responsable por nivel y último nivel sin tope.`,
        );
      }
    }

    const personalAprobador =
      Number(esquema.matrices) && Number(esquema.usuarios)
        ? await this.dataSource.query(
            `SELECT id,rol FROM Usuarios WHERE empresaId=$1 AND activo=true`,
            [empresaId],
          )
        : [];
    const nivelesAprobacion =
      Number(esquema.matrices)
        ? await this.dataSource.query(
            `SELECT proceso,orden,usuarioId,rolAprobador
               FROM configuraciones_aprobacion
              WHERE empresaId=$1 AND activo=true
                AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
              ORDER BY proceso,orden`,
            [empresaId],
          )
        : [];
    for (const proceso of ['CREDITO_CLIENTE', 'HOTEL_CONVENIO']) {
      const nivelesProceso = nivelesAprobacion
        .filter((nivel: any) => nivel.proceso === proceso)
        .map((nivel: any) => ({
          orden: Number(nivel.orden),
          candidatos: nivel.usuarioId
            ? [String(nivel.usuarioId)]
            : personalAprobador
                .filter(
                  (usuario: any) =>
                    normalizarRol(usuario.rol) ===
                    normalizarRol(nivel.rolAprobador),
                )
                .map((usuario: any) => String(usuario.id)),
        }));
      if (
        nivelesProceso.length &&
        !existeAsignacionSegregada(nivelesProceso)
      ) {
        bloqueos.push(
          `La matriz ${proceso} no puede completarse con personas distintas en todos los niveles. Agrega aprobadores activos o cambia los responsables.`,
        );
      }
    }

    const integridadDatos =
      Number(esquema.convenios) &&
      Number(esquema.hoteles) &&
      Number(esquema.aprobaciones) &&
      Number(esquema.versionConvenioCredito) &&
      Number(esquema.estadoSolicitudCredito) &&
      Number(esquema.limiteCreditoSolicitado) &&
      Number(esquema.diasCreditoSolicitados) &&
      Number(esquema.versionSolicitudCredito) &&
      Number(esquema.cuentaConvenioVersion) &&
      Number(esquema.cuentaNumeroConvenioSnapshot) &&
      Number(esquema.cuentaTipoConvenioSnapshot) &&
      Number(esquema.cuentaLimiteCreditoAplicado) &&
      Number(esquema.cuentaDiasCreditoAplicados) &&
      Number(esquema.cuentaVersionCreditoAplicada)
        ? await this.dataSource.query(
            `SELECT
               SUM(CASE WHEN h.vigenciaHasta IS NOT NULL AND h.vigenciaHasta<h.vigenciaDesde THEN 1 ELSE 0 END) vigenciasInvalidas,
               SUM(CASE WHEN ABS(COALESCE(h.tolerancia,0))>0.009 THEN 1 ELSE 0 END) toleranciasNoCero,
               SUM(CASE WHEN h.estado='APROBADO' AND h.vigenciaHasta IS NOT NULL AND h.vigenciaHasta<$2 THEN 1 ELSE 0 END) aprobadosVencidos,
               SUM(CASE WHEN h.estado IN ('PENDIENTE','APROBADO') AND (hotel.id IS NULL OR hotel.activo=false) THEN 1 ELSE 0 END) conveniosSinHotelActivo,
               SUM(CASE WHEN h.estado='CANCELADO' AND h.activo<>false THEN 1 ELSE 0 END) canceladosActivos,
               SUM(CASE WHEN h.estado IN ('PENDIENTE','APROBADO','SUSPENDIDO','VENCIDO') AND h.activo=false THEN 1 ELSE 0 END) vigentesInactivos,
               SUM(CASE WHEN h.estado='CANCELADO' AND EXISTS (
                     SELECT 1 FROM aprobaciones_documentos a
                      WHERE a.empresaId=h.empresaId
                        AND a.proceso='HOTEL_CONVENIO'
                        AND a.documentoId=h.id
                        AND a.estado='PENDIENTE'
                   ) THEN 1 ELSE 0 END) canceladosConAprobacionPendiente,
               (SELECT COUNT(*)
                  FROM clientes c
                 WHERE c.empresaId=$1
                   AND c.estadoSolicitudCredito='PENDIENTE'
                   AND (
                     c.activo=false OR
                     COALESCE(c.limiteCreditoSolicitado,0)<=0 OR
                     COALESCE(c.diasCreditoSolicitados,0)<=0 OR
                     COALESCE(c.versionSolicitudCredito,0)<=0
                   )) solicitudesCreditoInvalidas,
               (SELECT COUNT(*)
                  FROM aprobaciones_documentos a
                  INNER JOIN clientes c
                    ON c.id=a.documentoId AND c.empresaId=a.empresaId
                 WHERE a.empresaId=$1
                   AND a.proceso='CREDITO_CLIENTE'
                   AND a.estado='PENDIENTE'
                   AND (
                     c.estadoSolicitudCredito<>'PENDIENTE' OR
                     a.documentoVersion<>c.versionSolicitudCredito
                   )) aprobacionesCreditoDesfasadas,
               (SELECT COUNT(*)
                  FROM hoteleria_convenios_credito hc
                  INNER JOIN clientes c
                    ON c.id=hc.clienteId AND c.empresaId=hc.empresaId
                 WHERE hc.empresaId=$1
                   AND hc.estado IN ('PENDIENTE','APROBADO')
                   AND (
                     c.activo=false OR
                     c.estadoCredito<>'AUTORIZADO' OR
                     (hc.estado='PENDIENTE' AND c.estadoSolicitudCredito='PENDIENTE') OR
                     hc.versionCreditoCliente<>c.versionCredito OR
                     hc.tipo<>c.clasificacionHotelera
                   )) conveniosCreditoDesfasado,
               (SELECT COUNT(*)
                  FROM aprobaciones_documentos a
                 WHERE a.empresaId=$1
                   AND a.proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
                   AND a.estado='PENDIENTE'
                   AND a.usuarioAprobadorId IS NULL) nivelesPendientesSinPersona,
               (SELECT COUNT(*)
                  FROM hoteleria_city_ledger_cuentas cc
                 WHERE cc.empresaId=$1
                   AND (
                     cc.convenioVersion IS NULL OR cc.convenioVersion<=0 OR
                     NULLIF(LTRIM(RTRIM(cc.numeroConvenioSnapshot)),'') IS NULL OR
                     NULLIF(LTRIM(RTRIM(cc.tipoConvenioSnapshot)),'') IS NULL OR
                     cc.limiteCreditoAplicado IS NULL OR cc.limiteCreditoAplicado<0 OR
                     cc.diasCreditoAplicados IS NULL OR cc.diasCreditoAplicados<=0 OR
                     cc.versionCreditoClienteAplicada IS NULL OR cc.versionCreditoClienteAplicada<=0
                   )) cuentasSinEvidenciaHistorica,
               (SELECT COUNT(*) FROM (
                  SELECT fechaVencimiento,
                         ROW_NUMBER() OVER(
                           PARTITION BY empresaId,proceso,documentoId,ciclo
                           ORDER BY nivel
                         ) posicion
                    FROM aprobaciones_documentos
                   WHERE empresaId=$1
                     AND proceso IN ('CREDITO_CLIENTE','HOTEL_CONVENIO')
                     AND estado='PENDIENTE'
                ) sla
                WHERE (sla.posicion=1 AND sla.fechaVencimiento IS NULL)
                   OR (sla.posicion>1 AND sla.fechaVencimiento IS NOT NULL)) slaNoSecuencial
              FROM hoteleria_convenios_credito h
              LEFT JOIN hoteles hotel
                ON hotel.id=h.hotelId AND hotel.empresaId=h.empresaId
             WHERE h.empresaId=$1`,
            [empresaId, fechaIso()],
          )
        : [];
    const integridad = integridadDatos?.[0] ?? {};
    const controlesIntegridad: Array<[string, string]> = [
      ['vigenciasInvalidas', 'Hay convenios con fecha final anterior a la inicial.'],
      ['toleranciasNoCero', 'Hay convenios cuya tolerancia legada amplía la línea maestra.'],
      ['aprobadosVencidos', 'Hay convenios aprobados cuya vigencia ya terminó y no fueron marcados VENCIDO.'],
      ['conveniosSinHotelActivo', 'Hay convenios pendientes o aprobados asociados a un hotel inactivo o inexistente.'],
      ['canceladosActivos', 'Hay convenios CANCELADO que continúan activos.'],
      ['vigentesInactivos', 'Hay convenios no cancelados marcados como inactivos.'],
      ['canceladosConAprobacionPendiente', 'Hay convenios cancelados con niveles de aprobación todavía pendientes.'],
      ['solicitudesCreditoInvalidas', 'Hay propuestas de crédito pendientes sin límite, plazo, versión o cliente activo.'],
      ['aprobacionesCreditoDesfasadas', 'Hay niveles pendientes de crédito que no corresponden a la versión vigente de la propuesta.'],
      ['conveniosCreditoDesfasado', 'Hay convenios pendientes o aprobados vinculados a una línea maestra no autorizada o de otra versión/clasificación.'],
      ['nivelesPendientesSinPersona', 'Hay niveles centrales pendientes sin una persona concreta asignada; la segregación no queda garantizada hasta materializar la ruta.'],
      ['cuentasSinEvidenciaHistorica', 'Hay cuentas City Ledger sin evidencia completa de la versión, línea y plazo que se aplicaron al originarlas.'],
      ['slaNoSecuencial', 'El SLA de aprobaciones no está activándose de forma secuencial por nivel.'],
    ];
    for (const [campo, mensaje] of controlesIntegridad) {
      if (Number(integridad[campo] ?? 0) > 0) bloqueos.push(mensaje);
    }

    const rolesNecesarios = [
      'CLIENTES_CXC',
      'IVA_TRASLADADO_NO_COBRADO',
      'IVA_TRASLADADO_COBRADO',
      'INGRESOS_HOSPEDAJE',
      'IMPUESTO_HOSPEDAJE_POR_PAGAR',
    ];
    const cuentas = await this.dataSource.query(
      `SELECT rolSistema FROM cuentas_contables
        WHERE empresaId=$1 AND activo=true AND esAfectable=true
          AND rolSistema IN (${rolesNecesarios.map((_, i) => `$${i + 2}`).join(',')})`,
      [empresaId, ...rolesNecesarios],
    );
    const presentes = new Set(cuentas.map((cuenta: any) => cuenta.rolSistema));
    for (const rol of rolesNecesarios) {
      if (!presentes.has(rol)) {
        bloqueos.push(`Falta una cuenta contable afectable con rol ${rol}.`);
      }
    }
    return {
      listo: bloqueos.length === 0,
      bloqueos,
      comprobaciones: {
        esquema,
        matrices,
        nivelesAprobacion,
        aprobadoresActivos: personalAprobador.length,
        integridadDatos: integridad,
        rolesContablesPresentes: [...presentes],
      },
      recomendacion: bloqueos.length
        ? 'No habilites crédito hotelero hasta resolver todos los bloqueos en staging y repetir esta verificación.'
        : 'La estructura mínima está lista. Ejecuta migraciones, pruebas de concurrencia, contabilización y cobranza sobre una copia anonimizada antes de producción.',
    };
  }
}
