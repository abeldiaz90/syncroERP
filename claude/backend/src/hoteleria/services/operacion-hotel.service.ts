import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import {
  CargoFolio,
  EstadoContableFolio,
  EstadoFolio,
  EstadoPagoHotel,
  Folio,
  MetodoPagoHotel,
  PagoFolioHotel,
  TipoCargo,
} from '../entities/folio.entity';
import { DotacionTipoHabitacion } from '../entities/dotacion-tipo-habitacion.entity';
import {
  EstadoTarea,
  TareaHousekeeping,
  TipoLimpieza,
} from '../entities/tarea-housekeeping.entity';
import { Hotel } from '../entities/hotel.entity';
import {
  AgregarConsumoDto,
  CambiarHabitacionDto,
  CancelarReservacionDto,
  CheckInDto,
  CheckOutDto,
  CrearReservacionDto,
  PagoCheckOutDto,
} from '../dto/hoteleria.dtos';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import {
  CuentaBancaria,
  TipoCuentaBancaria,
} from '../../credito/entities/cuenta-bancaria.entity';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { PreciosService } from '../../catalogo/services/precios.service';
import { DisponibilidadService } from './disponibilidad.service';
import { ConsumoRecetasService } from '../../recetas/services/consumo-recetas.service';
import { CityLedgerService } from './city-ledger.service';
import { CajaService } from '../../caja/services/caja.service';
import {
  NaturalezaMovimientoCaja,
  TipoMovimientoCaja,
} from '../../caja/entities/movimiento-caja.entity';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';

const CREDIT_METHODS = new Set<MetodoPagoHotel>([
  MetodoPagoHotel.CREDITO_EMPRESA,
  MetodoPagoHotel.CREDITO_AGENCIA,
]);

const money = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0) * 100) / 100;
const cents = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);

interface TaxBreakdown {
  subtotal: number;
  iva: number;
  impuestoHospedaje: number;
  total: number;
}

@Injectable()
export class OperacionHotelService {
  private readonly logger = new Logger(OperacionHotelService.name);

  constructor(
    @InjectRepository(Reservacion)
    private readonly resRepo: Repository<Reservacion>,
    @InjectRepository(Folio)
    private readonly folioRepo: Repository<Folio>,
    @InjectRepository(Hotel)
    private readonly hotelRepo: Repository<Hotel>,
    private readonly inventarioService: InventarioService,
    private readonly tesoreriaService: TesoreriaService,
    private readonly cajaService: CajaService,
    private readonly asientos: AsientosPendientesService,
    private readonly preciosService: PreciosService,
    private readonly disponibilidadService: DisponibilidadService,
    private readonly consumoRecetasService: ConsumoRecetasService,
    private readonly cityLedgerService: CityLedgerService,
    private readonly dataSource: DataSource,
  ) {}

  private noches(entrada: string, salida: string): number {
    const inicio = Date.parse(`${entrada.slice(0, 10)}T00:00:00Z`);
    const fin = Date.parse(`${salida.slice(0, 10)}T00:00:00Z`);
    const n = Math.round((fin - inicio) / 86_400_000);
    return Math.max(1, n);
  }

  private desglosarImporte(
    importeUnitario: number,
    cantidad: number,
    hotel: Hotel,
    opciones: { tasaIva?: number; aplicarImpuestoHospedaje?: boolean } = {},
  ): TaxBreakdown {
    const importe = money(importeUnitario * cantidad);
    const tasaIva = Number(opciones.tasaIva ?? hotel.tasaIva ?? 0) / 100;
    const tasaIsh =
      opciones.aplicarImpuestoHospedaje === false
        ? 0
        : Number(hotel.tasaImpuestoHospedaje ?? 0) / 100;
    let subtotal: number;
    if (hotel.preciosIncluyenImpuestos) {
      const divisor = 1 + tasaIva + tasaIsh;
      subtotal = divisor > 0 ? money(importe / divisor) : importe;
    } else {
      subtotal = importe;
    }
    const iva = money(subtotal * tasaIva);
    const impuestoHospedaje = money(subtotal * tasaIsh);
    const total = hotel.preciosIncluyenImpuestos
      ? importe
      : money(subtotal + iva + impuestoHospedaje);
    // Absorbe en el subtotal cualquier centavo de redondeo para que la línea cuadre.
    const diferencia =
      cents(total) - cents(subtotal) - cents(iva) - cents(impuestoHospedaje);
    subtotal = money(subtotal + diferencia / 100);
    return { subtotal, iva, impuestoHospedaje, total };
  }

  /**
   * Traduce el total calculado al nombre real de la columna de CargoFolio.
   * Mantener este mapeo en un solo lugar evita volver a enviar `total`, que no
   * existe en cargos_folio, dejando el campo obligatorio `importe` en NULL.
   */
  private camposCargo(desglose: TaxBreakdown) {
    return {
      subtotal: desglose.subtotal,
      iva: desglose.iva,
      impuestoHospedaje: desglose.impuestoHospedaje,
      importe: desglose.total,
    };
  }

  private async hotelOrFail(
    manager: EntityManager,
    hotelId: string,
    empresaId: string,
  ): Promise<Hotel> {
    const hotel = await manager.getRepository(Hotel).findOne({
      where: { id: hotelId, empresaId, activo: true },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado o inactivo.');

    // Compatibilidad con propiedades creadas antes de que el PMS incorporara
    // moneda, zona horaria e impuestos configurables. Asignar expresamente un
    // valor NULL del registro anterior al nuevo folio provoca el error 515 de
    // SQL Server aunque el formulario de check-in esté completo.
    const valoresPorDefecto: Partial<Hotel> = {
      horaCheckIn: '15:00',
      horaCheckOut: '12:00',
      zonaHoraria: 'America/Mexico_City',
      moneda: 'MXN',
      tasaIva: 16,
      tasaImpuestoHospedaje: 0,
      nombreImpuestoHospedaje: 'Impuesto sobre hospedaje',
      preciosIncluyenImpuestos: true,
      exigirInventarioDotacion: true,
      permitirSobreventa: false,
    };
    let corregido = false;
    for (const [campo, valor] of Object.entries(valoresPorDefecto)) {
      if ((hotel as unknown as Record<string, unknown>)[campo] == null) {
        (hotel as unknown as Record<string, unknown>)[campo] = valor;
        corregido = true;
      }
    }
    if (corregido) await manager.getRepository(Hotel).save(hotel);
    return hotel;
  }

  private async siguienteCodigo(
    manager: EntityManager,
    empresaId: string,
  ): Promise<string> {
    const lock = await manager.query(
      `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
      [`HOTEL:RESERVACION:${empresaId}`],
    );
    if (Number(lock?.[0]?.resultado ?? -999) < 0) {
      throw new ConflictException(
        'No fue posible reservar el folio de la reservación.',
      );
    }
    const row = await manager.query(
      `SELECT MAX(CASE WHEN SUBSTRING(codigo, 5, 16) ~ '^[0-9]+$' THEN CAST(SUBSTRING(codigo, 5, 16) AS bigint) END) maximo
         FROM reservaciones
        WHERE empresaId=$1 AND codigo LIKE 'RES-%'`,
      [empresaId],
    );
    return `RES-${String(Number(row?.[0]?.maximo ?? 0) + 1).padStart(8, '0')}`;
  }

  private async validarDisponibilidad(
    manager: EntityManager,
    dto: CrearReservacionDto,
    empresaId: string,
    hotel: Hotel,
  ): Promise<{ tarifaBase: number; capacidad: number }> {
    const tipo = await manager.query(
      // `tipo[0].tarifaBase` era undefined y `Number(undefined ?? 0)` daba 0:
      // TODA reservación nacía con tarifa base cero.
      `SELECT id, capacidad, tarifaBase AS "tarifaBase", activo FROM tipos_habitacion
        WHERE id=$1 AND hotelId=$2 AND empresaId=$3`,
      [dto.tipoHabitacionId, dto.hotelId, empresaId],
    );
    if (!tipo?.[0] || !tipo[0].activo) {
      throw new BadRequestException(
        'El tipo de habitación no pertenece al hotel o está inactivo.',
      );
    }
    if (Number(dto.numHuespedes ?? 1) > Number(tipo[0].capacidad ?? 1)) {
      throw new BadRequestException(
        'El número de huéspedes supera la capacidad del tipo de habitación.',
      );
    }
    await this.disponibilidadService.validarCupo(
      {
        tipoHabitacionId: dto.tipoHabitacionId,
        fechaEntrada: new Date(dto.fechaEntrada),
        fechaSalida: new Date(dto.fechaSalida),
        permitirSobreventa: hotel.permitirSobreventa,
        porcentajeSobreventa: 10,
      },
      empresaId,
      manager,
    );
    return {
      tarifaBase: Number(tipo[0].tarifaBase ?? 0),
      capacidad: Number(tipo[0].capacidad ?? 1),
    };
  }

  async crearReservacion(dto: CrearReservacionDto, empresaId: string) {
    if (dto.fechaSalida.slice(0, 10) <= dto.fechaEntrada.slice(0, 10)) {
      throw new BadRequestException(
        'La fecha de salida debe ser posterior a la de entrada.',
      );
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const hotel = await this.hotelOrFail(manager, dto.hotelId, empresaId);
      const tipo = await this.validarDisponibilidad(
        manager,
        dto,
        empresaId,
        hotel,
      );
      const cliente = await manager.getRepository(Cliente).findOne({
        where: { id: dto.clienteId, empresaId, activo: true },
      });
      if (!cliente) {
        throw new BadRequestException(
          'El huésped no existe, está inactivo o pertenece a otra empresa.',
        );
      }
      if (tipo.tarifaBase <= 0) {
        throw new BadRequestException(
          'El tipo de habitación no tiene una tarifa base mayor a cero.',
        );
      }
      const codigo = await this.siguienteCodigo(manager, empresaId);
      const repo = manager.getRepository(Reservacion);
      const reserva = repo.create({
        ...dto,
        empresaId,
        codigo,
        numHuespedes: dto.numHuespedes ?? 1,
        clienteNombre: cliente.nombre,
        // La tarifa la determina el catálogo hotelero, no el navegador.
        tarifaNoche: money(tipo.tarifaBase),
        estado: EstadoReservacion.CONFIRMADA,
      });
      return repo.save(reserva);
    });
  }

  obtenerReservaciones(empresaId: string, hotelId?: string) {
    return this.resRepo.find({
      where: { empresaId, ...(hotelId ? { hotelId } : {}) },
      order: { fechaEntrada: 'DESC', fechaCreacion: 'DESC' },
    });
  }

  async obtenerReservacion(id: string, empresaId: string) {
    const reserva = await this.resRepo.findOne({ where: { id, empresaId } });
    if (!reserva) throw new NotFoundException('Reservación no encontrada.');
    return reserva;
  }

  async obtenerPanel(hotelId: string, empresaId: string) {
    if (!hotelId) throw new BadRequestException('Selecciona una propiedad.');
    const hotel = await this.hotelRepo.findOne({
      where: { id: hotelId, empresaId, activo: true },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado o inactivo.');
    const hoy = fechaCalendarioNegocio(
      new Date(),
      hotel.zonaHoraria ?? 'America/Mexico_City',
    );
    const [habitaciones, reservaciones, folios] = await Promise.all([
      this.dataSource.getRepository(Habitacion).find({
        where: { hotelId, empresaId, activo: true },
      }),
      this.resRepo.find({ where: { hotelId, empresaId } }),
      this.folioRepo
        .createQueryBuilder('folio')
        .innerJoin(Reservacion, 'reserva', 'reserva.id = folio.reservacionId')
        .where('folio.empresaId = :empresaId', { empresaId })
        .andWhere('reserva.hotelId = :hotelId', { hotelId })
        .getMany(),
    ]);
    const habitacionesOperativas = habitaciones.filter(
      (habitacion) =>
        habitacion.estado !== EstadoHabitacion.MANTENIMIENTO &&
        habitacion.estado !== EstadoHabitacion.BLOQUEADA,
    );
    const ocupadas = habitaciones.filter(
      (habitacion) => habitacion.estado === EstadoHabitacion.OCUPADA,
    ).length;
    const porEstado = habitaciones.reduce<Record<string, number>>(
      (acumulado, habitacion) => {
        acumulado[habitacion.estado] = (acumulado[habitacion.estado] ?? 0) + 1;
        return acumulado;
      },
      {},
    );
    const foliosAbiertos = folios.filter(
      (folio) => folio.estado === EstadoFolio.ABIERTO,
    );
    return {
      hotelId,
      fechaOperativa: hotel.fechaOperativa ?? hoy,
      habitaciones: {
        total: habitaciones.length,
        operativas: habitacionesOperativas.length,
        ocupadas,
        disponibles: porEstado[EstadoHabitacion.DISPONIBLE] ?? 0,
        limpieza: porEstado[EstadoHabitacion.LIMPIEZA] ?? 0,
        inspeccion: porEstado[EstadoHabitacion.INSPECCION] ?? 0,
        mantenimiento: porEstado[EstadoHabitacion.MANTENIMIENTO] ?? 0,
        bloqueadas: porEstado[EstadoHabitacion.BLOQUEADA] ?? 0,
        ocupacionPorcentaje: habitacionesOperativas.length
          ? money((ocupadas / habitacionesOperativas.length) * 100)
          : 0,
      },
      operacion: {
        llegadasHoy: reservaciones.filter(
          (reserva) =>
            reserva.estado === EstadoReservacion.CONFIRMADA &&
            reserva.fechaEntrada === hoy,
        ).length,
        salidasHoy: reservaciones.filter(
          (reserva) =>
            reserva.estado === EstadoReservacion.CHECK_IN &&
            reserva.fechaSalida === hoy,
        ).length,
        huespedesEnCasa: reservaciones
          .filter((reserva) => reserva.estado === EstadoReservacion.CHECK_IN)
          .reduce(
            (total, reserva) => total + Number(reserva.numHuespedes ?? 1),
            0,
          ),
        reservacionesActivas: reservaciones.filter((reserva) =>
          [EstadoReservacion.CONFIRMADA, EstadoReservacion.CHECK_IN].includes(
            reserva.estado,
          ),
        ).length,
        foliosAbiertos: foliosAbiertos.length,
        saldoFoliosAbiertos: money(
          foliosAbiertos.reduce(
            (total, folio) => total + Number(folio.saldoPendiente ?? 0),
            0,
          ),
        ),
      },
    };
  }

  async cancelarReservacion(
    reservacionId: string,
    dto: CancelarReservacionDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const reserva = await manager
        .getRepository(Reservacion)
        .createQueryBuilder('reserva')
        .setLock('pessimistic_write')
        .where('reserva.id = :id AND reserva.empresaId = :empresaId', {
          id: reservacionId,
          empresaId,
        })
        .getOne();
      if (!reserva) throw new NotFoundException('Reservación no encontrada.');
      if (reserva.estado !== EstadoReservacion.CONFIRMADA) {
        throw new ConflictException(
          'Sólo una reservación confirmada puede cancelarse. Un huésped alojado debe pasar por check-out.',
        );
      }
      reserva.estado = EstadoReservacion.CANCELADA;
      reserva.fechaCancelacion = new Date();
      reserva.motivoCancelacion = dto.motivo.trim();
      reserva.canceladoPorId = usuarioId ?? null;
      await manager.getRepository(Reservacion).save(reserva);
      return { ok: true, estado: reserva.estado };
    });
  }

  async marcarNoShow(
    reservacionId: string,
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const reserva = await manager
        .getRepository(Reservacion)
        .createQueryBuilder('reserva')
        .setLock('pessimistic_write')
        .where('reserva.id = :id AND reserva.empresaId = :empresaId', {
          id: reservacionId,
          empresaId,
        })
        .getOne();
      if (!reserva) throw new NotFoundException('Reservación no encontrada.');
      if (reserva.estado !== EstadoReservacion.CONFIRMADA) {
        throw new ConflictException(
          'Sólo una reservación confirmada puede marcarse como no-show.',
        );
      }
      const hotel = await this.hotelOrFail(manager, reserva.hotelId, empresaId);
      const hoy = fechaCalendarioNegocio(
        new Date(),
        hotel.zonaHoraria ?? 'America/Mexico_City',
      );
      if (reserva.fechaEntrada > hoy) {
        throw new BadRequestException(
          `No puede marcarse no-show antes del ${reserva.fechaEntrada}.`,
        );
      }
      reserva.estado = EstadoReservacion.NO_SHOW;
      reserva.fechaNoShow = new Date();
      reserva.marcadoNoShowPorId = usuarioId ?? null;
      await manager.getRepository(Reservacion).save(reserva);
      return { ok: true, estado: reserva.estado };
    });
  }

  async cambiarHabitacion(
    reservacionId: string,
    dto: CambiarHabitacionDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const reserva = await manager
        .getRepository(Reservacion)
        .createQueryBuilder('reserva')
        .setLock('pessimistic_write')
        .where('reserva.id = :id AND reserva.empresaId = :empresaId', {
          id: reservacionId,
          empresaId,
        })
        .getOne();
      if (!reserva) throw new NotFoundException('Reservación no encontrada.');
      if (
        reserva.estado !== EstadoReservacion.CHECK_IN ||
        !reserva.habitacionId
      ) {
        throw new ConflictException(
          'El cambio de habitación requiere un hospedaje activo.',
        );
      }
      if (reserva.habitacionId === dto.habitacionId) {
        throw new BadRequestException('Selecciona una habitación diferente.');
      }
      const habitaciones = await manager
        .getRepository(Habitacion)
        .createQueryBuilder('habitacion')
        .setLock('pessimistic_write')
        .where('habitacion.id IN (:...ids)', {
          ids: [reserva.habitacionId, dto.habitacionId],
        })
        .andWhere('habitacion.empresaId = :empresaId', { empresaId })
        .getMany();
      const anterior = habitaciones.find(
        (habitacion) => habitacion.id === reserva.habitacionId,
      );
      const nueva = habitaciones.find(
        (habitacion) => habitacion.id === dto.habitacionId,
      );
      if (!anterior || !nueva) {
        throw new NotFoundException('No se encontró una de las habitaciones.');
      }
      if (
        nueva.hotelId !== reserva.hotelId ||
        nueva.tipoHabitacionId !== reserva.tipoHabitacionId
      ) {
        throw new BadRequestException(
          'La nueva habitación debe pertenecer al mismo hotel y tipo reservado.',
        );
      }
      if (!nueva.activo || nueva.estado !== EstadoHabitacion.DISPONIBLE) {
        throw new ConflictException(
          `La habitación ${nueva.numero} no está disponible.`,
        );
      }
      anterior.estado = EstadoHabitacion.LIMPIEZA;
      nueva.estado = EstadoHabitacion.OCUPADA;
      await manager.getRepository(Habitacion).save([anterior, nueva]);
      await manager.getRepository(TareaHousekeeping).save(
        manager.getRepository(TareaHousekeeping).create({
          empresaId,
          habitacionId: anterior.id,
          habitacionNumero: anterior.numero,
          tipo: TipoLimpieza.ESTANCIA,
          estado: EstadoTarea.PENDIENTE,
        }),
      );
      reserva.habitacionId = nueva.id;
      reserva.ultimoMotivoCambioHabitacion = dto.motivo.trim();
      await manager.getRepository(Reservacion).save(reserva);
      return {
        ok: true,
        habitacionAnterior: anterior.numero,
        habitacionNueva: nueva.numero,
        cambiadoPorId: usuarioId ?? null,
      };
    });
  }

  async checkIn(
    reservacionId: string,
    dto: CheckInDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const reserva = await manager
        .getRepository(Reservacion)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id=:id AND r.empresaId=:empresaId', {
          id: reservacionId,
          empresaId,
        })
        .getOne();
      if (!reserva) throw new NotFoundException('Reservación no encontrada.');
      if (reserva.estado !== EstadoReservacion.CONFIRMADA) {
        throw new BadRequestException('La reservación no está confirmada.');
      }
      const hotel = await this.hotelOrFail(manager, reserva.hotelId, empresaId);
      const habitacion = await manager
        .getRepository(Habitacion)
        .createQueryBuilder('h')
        .setLock('pessimistic_write')
        .where('h.id=:id AND h.empresaId=:empresaId', {
          id: dto.habitacionId,
          empresaId,
        })
        .getOne();
      if (!habitacion) throw new NotFoundException('Habitación no encontrada.');
      if (
        habitacion.hotelId !== reserva.hotelId ||
        habitacion.tipoHabitacionId !== reserva.tipoHabitacionId
      ) {
        throw new BadRequestException(
          'La habitación no corresponde al hotel y tipo reservados.',
        );
      }
      if (
        !habitacion.activo ||
        habitacion.estado !== EstadoHabitacion.DISPONIBLE
      ) {
        throw new ConflictException(
          `La habitación ${habitacion.numero} no está disponible.`,
        );
      }
      const folioExistente = await manager.getRepository(Folio).findOne({
        where: { empresaId, reservacionId },
      });
      if (folioExistente)
        throw new ConflictException('La reservación ya tiene un folio.');

      const folioRepo = manager.getRepository(Folio);
      const folio = await folioRepo.save(
        folioRepo.create({
          empresaId,
          reservacionId,
          estado: EstadoFolio.ABIERTO,
          fechaOperativa:
            hotel.fechaOperativa ??
            fechaCalendarioNegocio(new Date(), hotel.zonaHoraria),
          moneda: hotel.moneda,
          subtotal: 0,
          iva: 0,
          impuestoHospedaje: 0,
          total: 0,
          totalAplicado: 0,
          totalCobrado: 0,
          saldoPendiente: 0,
          estadoContable: EstadoContableFolio.NO_GENERADO,
        }),
      );

      const desglose = this.desglosarImporte(
        Number(reserva.tarifaNoche),
        1,
        hotel,
      );
      const cargoRepo = manager.getRepository(CargoFolio);
      await cargoRepo.save(
        cargoRepo.create({
          empresaId,
          folioId: folio.id,
          tipo: TipoCargo.HOSPEDAJE,
          concepto: `Hospedaje — noche 1 de ${this.noches(reserva.fechaEntrada, reserva.fechaSalida)}`,
          cantidad: 1,
          precioUnitario: money(reserva.tarifaNoche),
          ...this.camposCargo(desglose),
          tasaIva: Number(hotel.tasaIva),
          tasaImpuestoHospedaje: Number(hotel.tasaImpuestoHospedaje),
          centroIngreso: 'HABITACIONES',
          claveIdempotencia: `HOSPEDAJE:${reserva.id}:NOCHE:1`,
          registradoPorId: usuarioId ?? null,
        }),
      );
      Object.assign(folio, {
        subtotal: desglose.subtotal,
        iva: desglose.iva,
        impuestoHospedaje: desglose.impuestoHospedaje,
        total: desglose.total,
        saldoPendiente: desglose.total,
      });
      await folioRepo.save(folio);

      const insumos = await this.descontarDotacion(
        manager,
        reserva.tipoHabitacionId,
        habitacion,
        hotel,
        empresaId,
      );

      habitacion.estado = EstadoHabitacion.OCUPADA;
      await manager.getRepository(Habitacion).save(habitacion);
      reserva.estado = EstadoReservacion.CHECK_IN;
      reserva.habitacionId = habitacion.id;
      reserva.fechaCheckInReal = new Date();
      reserva.nochesPosteadas = 1;
      await manager.getRepository(Reservacion).save(reserva);

      return {
        ok: true,
        folioId: folio.id,
        consumiblesDescontados: insumos.consumibles,
        blancosEnUso: insumos.blancos,
        totalFolio: folio.total,
      };
    });
  }

  private async descontarDotacion(
    manager: EntityManager,
    tipoHabitacionId: string,
    habitacion: Habitacion,
    hotel: Hotel,
    empresaId: string,
  ): Promise<{ consumibles: number; blancos: number }> {
    const dotacion = await manager.getRepository(DotacionTipoHabitacion).find({
      where: { tipoHabitacionId, empresaId },
      order: { productoId: 'ASC' },
    });
    const consumibles = dotacion
      .filter((d) => (d.tipoArticulo ?? 'CONSUMIBLE') === 'CONSUMIBLE')
      .sort((a, b) => a.productoId.localeCompare(b.productoId));
    const blancos = dotacion.filter((d) => d.tipoArticulo === 'BLANCO');
    if (!consumibles.length) return { consumibles: 0, blancos: blancos.length };
    if (!hotel.almacenId) {
      if (hotel.exigirInventarioDotacion) {
        throw new BadRequestException(
          'El hotel requiere dotación, pero no tiene almacén configurado.',
        );
      }
      this.logger.warn(
        `Hotel ${hotel.id} sin almacén; se omite la dotación por configuración.`,
      );
      return { consumibles: 0, blancos: blancos.length };
    }
    for (const item of consumibles) {
      await this.inventarioService.registrarSalida(
        item.productoId,
        hotel.almacenId,
        Number(item.cantidad),
        `Dotación habitación ${habitacion.numero}`,
        empresaId,
        undefined,
        undefined,
        manager,
        { id: habitacion.id, tipo: 'HOTEL_DOTACION' },
      );
    }
    return { consumibles: consumibles.length, blancos: blancos.length };
  }

  async agregarConsumo(
    reservacionId: string,
    dto: AgregarConsumoDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const reserva = await manager.getRepository(Reservacion).findOne({
        where: {
          id: reservacionId,
          empresaId,
          estado: EstadoReservacion.CHECK_IN,
        },
      });
      if (!reserva)
        throw new NotFoundException(
          'No hay hospedaje activo para la reservación.',
        );
      const folio = await manager
        .getRepository(Folio)
        .createQueryBuilder('f')
        .setLock('pessimistic_write')
        .where(
          'f.reservacionId=:reservacionId AND f.empresaId=:empresaId AND f.estado=:estado',
          {
            reservacionId,
            empresaId,
            estado: EstadoFolio.ABIERTO,
          },
        )
        .getOne();
      if (!folio) throw new NotFoundException('No hay folio abierto.');
      const hotel = await this.hotelOrFail(manager, reserva.hotelId, empresaId);
      const clave = `CONSUMO:${folio.id}:${dto.claveIdempotencia ?? randomUUID()}`;
      const existente = await manager.getRepository(CargoFolio).findOne({
        where: { empresaId, claveIdempotencia: clave },
      });
      if (existente)
        return { ok: true, idempotente: true, totalFolio: folio.total };

      const precioOficial = await this.preciosService.consultarPrecio(
        dto.productoId,
        empresaId,
        dto.listaPrecioId,
      );
      if (precioOficial.sinPrecio) {
        throw new BadRequestException(
          `${precioOficial.nombre} no tiene precio en la lista aplicable.`,
        );
      }
      if (!hotel.almacenId) {
        throw new BadRequestException(
          'El hotel no tiene almacén para descontar el consumo.',
        );
      }
      const receta = await this.consumoRecetasService.consumirPorVenta(
        {
          productoId: dto.productoId,
          cantidadVendida: dto.cantidad,
          almacenId: hotel.almacenId,
          documentoId: folio.id,
          folio: reserva.codigo ?? undefined,
        },
        empresaId,
        manager,
      );
      if (!receta) {
        await this.inventarioService.registrarSalida(
          dto.productoId,
          hotel.almacenId,
          dto.cantidad,
          `Consumo folio ${reserva.codigo}`,
          empresaId,
          undefined,
          undefined,
          manager,
          { id: folio.id, tipo: 'HOTEL_CONSUMO' },
        );
      }
      const desglose = this.desglosarImporte(
        precioOficial.precioUnitario,
        dto.cantidad,
        hotel,
        {
          tasaIva: precioOficial.impuestoPorcentaje,
          aplicarImpuestoHospedaje: false,
        },
      );
      await manager.getRepository(CargoFolio).save(
        manager.getRepository(CargoFolio).create({
          empresaId,
          folioId: folio.id,
          tipo: TipoCargo.CONSUMO,
          concepto: dto.concepto,
          productoId: dto.productoId,
          cantidad: dto.cantidad,
          precioUnitario: precioOficial.precioUnitario,
          ...this.camposCargo(desglose),
          tasaIva: Number(precioOficial.impuestoPorcentaje),
          tasaImpuestoHospedaje: 0,
          centroIngreso: 'CONSUMOS',
          claveIdempotencia: clave,
          registradoPorId: usuarioId ?? null,
        }),
      );
      folio.subtotal = money(Number(folio.subtotal) + desglose.subtotal);
      folio.iva = money(Number(folio.iva) + desglose.iva);
      folio.impuestoHospedaje = money(
        Number(folio.impuestoHospedaje) + desglose.impuestoHospedaje,
      );
      folio.total = money(Number(folio.total) + desglose.total);
      folio.saldoPendiente = money(
        Number(folio.total) - Number(folio.totalAplicado),
      );
      await manager.getRepository(Folio).save(folio);
      return {
        ok: true,
        totalFolio: folio.total,
        precioAplicado: precioOficial.precioUnitario,
        inventarioDescontado: true,
      };
    });
  }

  async obtenerFolio(reservacionId: string, empresaId: string) {
    const folio = await this.folioRepo.findOne({
      where: { reservacionId, empresaId },
      relations: ['cargos', 'pagos'],
      order: { cargos: { fecha: 'ASC' }, pagos: { fecha: 'ASC' } },
    });
    if (!folio) throw new NotFoundException('Folio no encontrado.');
    const reserva = await this.resRepo.findOne({
      where: { id: reservacionId, empresaId },
    });
    if (!reserva) throw new NotFoundException('Reservación no encontrada.');
    const hotel = await this.hotelRepo.findOne({
      where: { id: reserva.hotelId, empresaId },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado.');
    const nochesPendientes = Math.max(
      0,
      this.noches(reserva.fechaEntrada, reserva.fechaSalida) -
        Number(reserva.nochesPosteadas ?? 0),
    );
    const pendiente = this.desglosarImporte(
      Number(reserva.tarifaNoche),
      nochesPendientes,
      hotel,
    );
    return {
      ...folio,
      moneda: hotel.moneda,
      nochesPendientes,
      subtotalCierreEstimado: money(
        Number(folio.subtotal) + pendiente.subtotal,
      ),
      ivaCierreEstimado: money(Number(folio.iva) + pendiente.iva),
      impuestoHospedajeCierreEstimado: money(
        Number(folio.impuestoHospedaje) + pendiente.impuestoHospedaje,
      ),
      totalCierreEstimado: money(Number(folio.total) + pendiente.total),
    };
  }

  /**
   * El cierre nunca debe depender de que el cron haya corrido puntualmente.
   * Antes de cobrar se materializan todas las noches contratadas que aún no
   * estén en el folio. La clave por noche conserva la idempotencia.
   */
  private async completarNochesAntesDeCerrar(
    manager: EntityManager,
    reserva: Reservacion,
    folio: Folio,
    hotel: Hotel,
    empresaId: string,
    usuarioId?: string,
  ): Promise<number> {
    const totalNoches = this.noches(reserva.fechaEntrada, reserva.fechaSalida);
    let posteadas = Number(reserva.nochesPosteadas ?? 0);
    let agregadas = 0;
    const cargoRepo = manager.getRepository(CargoFolio);

    while (posteadas < totalNoches) {
      const numeroNoche = posteadas + 1;
      const clave = `HOSPEDAJE:${reserva.id}:NOCHE:${numeroNoche}`;
      const existente = await cargoRepo.findOne({
        where: { empresaId, claveIdempotencia: clave },
      });
      if (!existente) {
        const desglose = this.desglosarImporte(
          Number(reserva.tarifaNoche),
          1,
          hotel,
        );
        await cargoRepo.save(
          cargoRepo.create({
            empresaId,
            folioId: folio.id,
            tipo: TipoCargo.HOSPEDAJE,
            concepto: `Hospedaje — noche ${numeroNoche} de ${totalNoches}`,
            cantidad: 1,
            precioUnitario: money(reserva.tarifaNoche),
            ...this.camposCargo(desglose),
            tasaIva: Number(hotel.tasaIva),
            tasaImpuestoHospedaje: Number(hotel.tasaImpuestoHospedaje),
            centroIngreso: 'HABITACIONES',
            claveIdempotencia: clave,
            registradoPorId: usuarioId ?? null,
          }),
        );
        agregadas++;
      }
      posteadas = numeroNoche;
    }

    if (posteadas !== Number(reserva.nochesPosteadas ?? 0)) {
      reserva.nochesPosteadas = posteadas;
      await manager.getRepository(Reservacion).save(reserva);
    }
    return agregadas;
  }

  private async validarPagos(
    manager: EntityManager,
    pagos: PagoCheckOutDto[],
    empresaId: string,
    total: number,
    monedaHotel: string,
  ): Promise<Map<string, CuentaBancaria>> {
    if (pagos.reduce((s, p) => s + cents(p.importe), 0) !== cents(total)) {
      throw new BadRequestException(
        `La suma de pagos debe ser exactamente ${money(total).toFixed(2)}.`,
      );
    }
    if (
      pagos.some(
        (p) =>
          (p.moneda ?? monedaHotel).toUpperCase() !== monedaHotel.toUpperCase(),
      )
    ) {
      throw new BadRequestException(
        `Los pagos deben registrarse en ${monedaHotel}. El cambio de divisas requiere conversión contable.`,
      );
    }
    const tieneCredito = pagos.some((p) => CREDIT_METHODS.has(p.metodoPago));
    const tieneCobro = pagos.some((p) => !CREDIT_METHODS.has(p.metodoPago));
    if (tieneCredito && tieneCobro) {
      throw new BadRequestException(
        'No se permite combinar crédito con cobros inmediatos en el mismo check-out. Divide el folio o liquida el crédito por separado para conservar correctamente el IVA cobrado y pendiente.',
      );
    }
    if (tieneCredito) {
      if (pagos.length !== 1) {
        throw new BadRequestException(
          'El crédito hotelero debe registrarse en una sola aplicación por folio.',
        );
      }
      if (!pagos[0].convenioId) {
        throw new BadRequestException(
          'Selecciona un convenio aprobado para cerrar el folio a crédito.',
        );
      }
    }
    const cuentasIds = [
      ...new Set(
        pagos
          .filter((p) => !CREDIT_METHODS.has(p.metodoPago))
          .map((p) => p.cuentaBancariaId)
          .filter(Boolean),
      ),
    ] as string[];
    if (
      pagos.some(
        (p) => !CREDIT_METHODS.has(p.metodoPago) && !p.cuentaBancariaId,
      )
    ) {
      throw new BadRequestException(
        'Efectivo, tarjeta, cheque y transferencia requieren una cuenta financiera/caja.',
      );
    }
    const cuentas = cuentasIds.length
      ? await manager
          .getRepository(CuentaBancaria)
          .find({ where: { empresaId, activo: true, id: In(cuentasIds) } })
      : [];
    const mapa = new Map(cuentas.map((c) => [c.id, c]));
    for (const pago of pagos) {
      if (CREDIT_METHODS.has(pago.metodoPago)) continue;
      if (!pago.cuentaBancariaId || !mapa.has(pago.cuentaBancariaId)) {
        throw new BadRequestException(
          'Una cuenta financiera del pago no existe, está inactiva o pertenece a otra empresa.',
        );
      }
      if (
        [
          MetodoPagoHotel.TARJETA,
          MetodoPagoHotel.TRANSFERENCIA,
          MetodoPagoHotel.CHEQUE,
        ].includes(pago.metodoPago) &&
        !pago.referencia?.trim()
      ) {
        throw new BadRequestException(
          `${pago.metodoPago} requiere referencia o autorización.`,
        );
      }
    }
    return mapa;
  }

  async checkOut(
    reservacionId: string,
    dto: CheckOutDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      const reserva = await manager
        .getRepository(Reservacion)
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.id=:id AND r.empresaId=:empresaId', {
          id: reservacionId,
          empresaId,
        })
        .getOne();
      if (!reserva) throw new NotFoundException('Reservación no encontrada.');
      const folio = await manager
        .getRepository(Folio)
        .createQueryBuilder('f')
        .setLock('pessimistic_write')
        .where('f.reservacionId=:reservacionId AND f.empresaId=:empresaId', {
          reservacionId,
          empresaId,
        })
        .getOne();
      if (!folio) throw new NotFoundException('Folio no encontrado.');
      if (
        folio.estado === EstadoFolio.CERRADO &&
        folio.claveIdempotenciaCierre === dto.claveIdempotencia
      ) {
        return {
          folio,
          reserva,
          pagos: await manager.getRepository(PagoFolioHotel).find({
            where: {
              folioId: folio.id,
              empresaId,
              estado: EstadoPagoHotel.APLICADO,
            },
          }),
          idempotente: true,
        };
      }
      if (
        reserva.estado !== EstadoReservacion.CHECK_IN ||
        folio.estado !== EstadoFolio.ABIERTO
      ) {
        throw new ConflictException(
          'El hospedaje no está disponible para check-out.',
        );
      }
      const hotel = await this.hotelOrFail(manager, reserva.hotelId, empresaId);
      await this.completarNochesAntesDeCerrar(
        manager,
        reserva,
        folio,
        hotel,
        empresaId,
        usuarioId,
      );
      const cargos = await manager
        .getRepository(CargoFolio)
        .find({ where: { folioId: folio.id, empresaId } });
      const totales = cargos.reduce(
        (a, c) => ({
          subtotal: money(a.subtotal + Number(c.subtotal)),
          iva: money(a.iva + Number(c.iva)),
          impuestoHospedaje: money(
            a.impuestoHospedaje + Number(c.impuestoHospedaje),
          ),
          total: money(a.total + Number(c.importe)),
        }),
        { subtotal: 0, iva: 0, impuestoHospedaje: 0, total: 0 },
      );
      const cuentas = await this.validarPagos(
        manager,
        dto.pagos,
        empresaId,
        totales.total,
        hotel.moneda,
      );
      const existente = await manager.getRepository(PagoFolioHotel).findOne({
        where: {
          empresaId,
          claveIdempotencia: `CHECKOUT:${dto.claveIdempotencia}:1`,
        },
      });
      if (existente)
        throw new ConflictException(
          'La clave de idempotencia ya se utilizó en otro check-out.',
        );

      const pagosGuardados: PagoFolioHotel[] = [];
      let totalCobrado = 0;
      const pagoCredito = dto.pagos.find((p) =>
        CREDIT_METHODS.has(p.metodoPago),
      );
      const cuentaCityLedger = pagoCredito
        ? await this.cityLedgerService.crearCuentaDesdeCheckout(manager, {
            empresaId,
            hotelId: reserva.hotelId,
            reservacionId: reserva.id,
            huespedClienteId: reserva.clienteId,
            folioId: folio.id,
            folioReferencia: reserva.codigo ?? folio.id.slice(0, 8),
            convenioId: pagoCredito.convenioId as string,
            metodoPago: pagoCredito.metodoPago,
            moneda: hotel.moneda.toUpperCase(),
            subtotal: totales.subtotal,
            iva: totales.iva,
            impuestoHospedaje: totales.impuestoHospedaje,
            total: totales.total,
            fechaEmision:
              folio.fechaOperativa ??
              fechaCalendarioNegocio(new Date(), hotel.zonaHoraria),
          })
        : null;
      for (let index = 0; index < dto.pagos.length; index++) {
        const p = dto.pagos[index];
        const esCredito = CREDIT_METHODS.has(p.metodoPago);
        let movimientoTesoreriaId: string | null = null;
        if (!esCredito) {
          const cuenta = cuentas.get(p.cuentaBancariaId as string)!;
          const fechaOperacion =
            folio.fechaOperativa ??
            fechaCalendarioNegocio(new Date(), hotel.zonaHoraria);
          const movimiento = await this.tesoreriaService.registrarEnTransaccion(
            {
              cuentaBancariaId: cuenta.id,
              fecha: fechaOperacion,
              tipo: TipoMovimiento.INGRESO,
              importe: money(p.importe),
              concepto: `Cobro hospedaje ${reserva.codigo}`,
              origen: OrigenMovimiento.HOSPEDAJE,
              referencia: p.referencia,
              documentoId: folio.id,
              tipoDocumento: 'FOLIO_HOTEL',
              terceroId: reserva.clienteId,
              nombreTercero: reserva.clienteNombre ?? undefined,
            },
            empresaId,
            usuarioId,
            manager,
          );
          movimientoTesoreriaId = movimiento?.id ?? null;
          if (cuenta.tipo === TipoCuentaBancaria.CAJA) {
            await this.cajaService.registrarEnTransaccion(
              manager,
              {
                cuentaCajaId: cuenta.id,
                naturaleza: NaturalezaMovimientoCaja.ENTRADA,
                tipo: TipoMovimientoCaja.VENTA,
                importe: money(p.importe),
                concepto: `Cobro de hospedaje ${reserva.codigo}`,
                referencia: p.referencia,
                documentoId: movimiento?.id ?? folio.id,
                tipoDocumento: 'TESORERIA_HOSPEDAJE',
              },
              empresaId,
              usuarioId,
            );
          }
          totalCobrado = money(totalCobrado + Number(p.importe));
        }
        const repo = manager.getRepository(PagoFolioHotel);
        pagosGuardados.push(
          await repo.save(
            repo.create({
              empresaId,
              folioId: folio.id,
              metodoPago: p.metodoPago,
              cuentaBancariaId: esCredito ? null : (p.cuentaBancariaId ?? null),
              convenioId: esCredito ? (p.convenioId ?? null) : null,
              importe: money(p.importe),
              moneda: hotel.moneda.toUpperCase(),
              tipoCambio: 1,
              referencia: p.referencia?.trim() || null,
              claveIdempotencia: `CHECKOUT:${dto.claveIdempotencia}:${index + 1}`,
              estado: EstadoPagoHotel.APLICADO,
              movimientoTesoreriaId,
              registradoPorId: usuarioId ?? null,
            }),
          ),
        );
      }

      Object.assign(folio, {
        ...totales,
        totalAplicado: totales.total,
        totalCobrado,
        totalCredito: cuentaCityLedger ? totales.total : 0,
        cuentaCobrarHotelId: cuentaCityLedger?.id ?? null,
        saldoPendiente: 0,
        estado: EstadoFolio.CERRADO,
        fechaCierre: new Date(),
        cerradoPorId: usuarioId ?? null,
        claveIdempotenciaCierre: dto.claveIdempotencia,
        estadoContable: EstadoContableFolio.PENDIENTE,
      });
      await manager.getRepository(Folio).save(folio);

      let habitacionNumero: string | null = null;
      if (reserva.habitacionId) {
        const habitacion = await manager.getRepository(Habitacion).findOne({
          where: { id: reserva.habitacionId, empresaId },
        });
        if (!habitacion)
          throw new NotFoundException('La habitación asignada ya no existe.');
        habitacion.estado = EstadoHabitacion.LIMPIEZA;
        await manager.getRepository(Habitacion).save(habitacion);
        habitacionNumero = habitacion.numero;
        await manager.getRepository(TareaHousekeeping).save(
          manager.getRepository(TareaHousekeeping).create({
            empresaId,
            habitacionId: habitacion.id,
            habitacionNumero: habitacion.numero,
            tipo: TipoLimpieza.SALIDA,
            estado: EstadoTarea.PENDIENTE,
          }),
        );
      }
      reserva.estado = EstadoReservacion.CHECK_OUT;
      reserva.fechaCheckOutReal = new Date();
      await manager.getRepository(Reservacion).save(reserva);

      /*
       * COSTO DE LOS CONSUMOS
       *
       * `registrarSalida` devuelve el costo real calculado lote por lote y ese
       * valor se estaba descartando: el inventario físico bajaba pero la cuenta
       * contable de Inventario nunca se acreditaba. Se recupera aquí sumando
       * los movimientos de salida ligados a este folio —consumos directos y
       * los insumos que consumió una receta— para que el asiento de hospedaje
       * incluya su Dr. Costo de ventas / Cr. Inventario.
       */
      const costoConsumos = money(
        (
          await manager
            .createQueryBuilder(MovimientoInventario, 'm')
            .select('SUM(m.costoTotal)', 'total')
            .where('m.empresaId = :empresaId', { empresaId })
            .andWhere('m.documentoId = :folioId', { folioId: folio.id })
            .andWhere('m.tipo = :tipo', { tipo: 'SALIDA' })
            .getRawOne<{ total: string | null }>()
        )?.total ?? 0,
      );

      const eventoContable = await this.asientos.encolarEnTransaccion(
        manager,
        TipoAsiento.HOSPEDAJE,
        {
          costoConsumos,
          documentoId: folio.id,
          empresaId,
          folio: reserva.codigo ?? folio.id.slice(0, 8),
          fecha: folio.fechaCierre ?? new Date(),
          subtotal: Number(folio.subtotal),
          subtotalHospedaje: money(
            cargos
              .filter((cargo) => cargo.tipo === TipoCargo.HOSPEDAJE)
              .reduce((suma, cargo) => suma + Number(cargo.subtotal), 0),
          ),
          subtotalConsumos: money(
            cargos
              .filter((cargo) => cargo.tipo !== TipoCargo.HOSPEDAJE)
              .reduce((suma, cargo) => suma + Number(cargo.subtotal), 0),
          ),
          iva: Number(folio.iva),
          impuestoHospedaje: Number(folio.impuestoHospedaje),
          total: Number(folio.total),
          pagos: pagosGuardados.map((pago) => ({
            metodoPago: pago.metodoPago,
            importe: Number(pago.importe),
            cuentaBancariaId: pago.cuentaBancariaId ?? undefined,
          })),
        },
        empresaId,
        reserva.codigo ?? folio.id.slice(0, 8),
        folio.id,
      );
      folio.asientoPendienteId = eventoContable.id;
      await manager.getRepository(Folio).save(folio);
      return {
        folio,
        reserva,
        pagos: pagosGuardados,
        cuentaCityLedger,
        asientoPendienteId: eventoContable.id,
        idempotente: false,
        habitacionNumero,
      };
    });

    if (resultado.idempotente) {
      return {
        ok: true,
        idempotente: true,
        folioId: resultado.folio.id,
        total: resultado.folio.total,
        estadoContable: resultado.folio.estadoContable,
      };
    }

    if (!resultado.asientoPendienteId) {
      return {
        ok: true,
        idempotente: false,
        folioId: resultado.folio.id,
        total: resultado.folio.total,
        totalCobrado: resultado.folio.totalCobrado,
        totalCredito: resultado.folio.totalCredito,
        cuentaCobrarHotelId: resultado.folio.cuentaCobrarHotelId,
        estadoContable: 'PENDIENTE',
        advertencia:
          'El cierre fue confirmado, pero el asiento quedó pendiente de seguimiento.',
      };
    }

    try {
      const asiento = await this.asientos.reintentarAhora(
        resultado.asientoPendienteId,
        empresaId,
      );

      await this.folioRepo.update(
        { id: resultado.folio.id, empresaId },
        {
          estadoContable: asiento.generado
            ? EstadoContableFolio.GENERADO
            : EstadoContableFolio.PENDIENTE,
          polizaId: asiento.polizaId ?? null,
          asientoPendienteId: resultado.asientoPendienteId,
        },
      );

      return {
        ok: true,
        idempotente: false,
        folioId: resultado.folio.id,
        total: resultado.folio.total,
        totalCobrado: resultado.folio.totalCobrado,
        totalCredito: resultado.folio.totalCredito,
        cuentaCobrarHotelId: resultado.folio.cuentaCobrarHotelId,
        estadoContable: asiento.generado ? 'GENERADO' : 'PENDIENTE',
        polizaId: asiento.polizaId,
        asientoPendienteId: resultado.asientoPendienteId,
        habitacion: resultado.habitacionNumero,
      };
    } catch (error) {
      this.logger.error(
        `El check-out ${resultado.folio.id} fue confirmado, pero el asiento ${resultado.asientoPendienteId} no pudo generarse inmediatamente. El outbox lo reintentará.`,
        error instanceof Error ? error.stack : String(error),
      );
      return {
        ok: true,
        idempotente: false,
        folioId: resultado.folio.id,
        total: resultado.folio.total,
        totalCobrado: resultado.folio.totalCobrado,
        totalCredito: resultado.folio.totalCredito,
        cuentaCobrarHotelId: resultado.folio.cuentaCobrarHotelId,
        estadoContable: 'PENDIENTE',
        asientoPendienteId: resultado.asientoPendienteId,
        habitacion: resultado.habitacionNumero,
        advertencia:
          'El check-out quedó confirmado. La póliza contable permanece pendiente y será reintentada automáticamente.',
      };
    }
  }
}
