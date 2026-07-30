// hoteleria/services/operacion-hotel.service.ts
// ═══════════════════════════════════════════════════════════════════════
// FASE 1: enlazado con InventarioService (descuenta stock + contabiliza)
// ═══════════════════════════════════════════════════════════════════════
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import {
  Folio,
  CargoFolio,
  EstadoFolio,
  TipoCargo,
} from '../entities/folio.entity';
import { DotacionTipoHabitacion } from '../entities/dotacion-tipo-habitacion.entity';
import {
  TareaHousekeeping,
  TipoLimpieza,
  EstadoTarea,
} from '../entities/tarea-housekeeping.entity';
import { Hotel } from '../entities/hotel.entity';
import {
  CrearReservacionDto,
  CheckInDto,
  AgregarConsumoDto,
} from '../dto/hoteleria.dtos';
// ⚠️ Ajusta la ruta a tu InventarioService real
import { InventarioService } from '../../catalogo/services/inventario.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';

@Injectable()
export class OperacionHotelService {
  private readonly logger = new Logger(OperacionHotelService.name);

  constructor(
    @InjectRepository(Reservacion)
    private readonly resRepo: Repository<Reservacion>,
    @InjectRepository(Habitacion)
    private readonly habRepo: Repository<Habitacion>,
    @InjectRepository(Folio) private readonly folioRepo: Repository<Folio>,
    @InjectRepository(CargoFolio)
    private readonly cargoRepo: Repository<CargoFolio>,
    @InjectRepository(DotacionTipoHabitacion)
    private readonly dotRepo: Repository<DotacionTipoHabitacion>,
    @InjectRepository(TareaHousekeeping)
    private readonly tareaRepo: Repository<TareaHousekeeping>,
    @InjectRepository(Hotel) private readonly hotelRepo: Repository<Hotel>,
    private readonly inventarioService: InventarioService,
    private readonly asientos: AsientosPendientesService,
    private readonly dataSource: DataSource,
  ) {}

  private noches(entrada: string, salida: string): number {
    const ms = new Date(salida).getTime() - new Date(entrada).getTime();
    const n = Math.round(ms / (1000 * 60 * 60 * 24));
    return n > 0 ? n : 1;
  }

  private async generarCodigo(empresaId: string): Promise<string> {
    const count = await this.resRepo.count({ where: { empresaId } });
    return `RES-${String(count + 1).padStart(6, '0')}`;
  }

  private async almacenDelHotel(
    hotelId: string,
    empresaId: string,
  ): Promise<string | null> {
    const hotel = await this.hotelRepo.findOne({
      where: { id: hotelId, empresaId },
    });
    return hotel?.almacenId ?? null;
  }

  // ── RESERVAR ─────────────────────────────────────────────────────────────
  async crearReservacion(dto: CrearReservacionDto, empresaId: string) {
    if (new Date(dto.fechaSalida) <= new Date(dto.fechaEntrada)) {
      throw new BadRequestException(
        'La fecha de salida debe ser posterior a la de entrada',
      );
    }
    const codigo = await this.generarCodigo(empresaId);
    const reserva = this.resRepo.create({
      ...dto,
      empresaId,
      codigo,
      numHuespedes: dto.numHuespedes ?? 1,
      tarifaNoche: dto.tarifaNoche ?? 0,
      estado: EstadoReservacion.CONFIRMADA,
    });
    return this.resRepo.save(reserva);
  }

  obtenerReservaciones(empresaId: string, hotelId?: string) {
    const where: any = { empresaId };
    if (hotelId) where.hotelId = hotelId;
    return this.resRepo.find({ where, order: { fechaEntrada: 'DESC' } });
  }

  async obtenerReservacion(id: string, empresaId: string) {
    const r = await this.resRepo.findOne({ where: { id, empresaId } });
    if (!r) throw new NotFoundException('Reservación no encontrada');
    return r;
  }

  // ── CHECK-IN ─────────────────────────────────────────────────────────────
  async checkIn(reservacionId: string, dto: CheckInDto, empresaId: string) {
    const reserva = await this.obtenerReservacion(reservacionId, empresaId);
    if (reserva.estado !== EstadoReservacion.CONFIRMADA) {
      throw new BadRequestException(
        'La reservación no está en estado Confirmada',
      );
    }
    const habitacion = await this.habRepo.findOne({
      where: { id: dto.habitacionId, empresaId },
    });
    if (!habitacion) throw new NotFoundException('Habitación no encontrada');
    if (habitacion.estado !== EstadoHabitacion.DISPONIBLE) {
      throw new BadRequestException(
        `La habitación ${habitacion.numero} no está disponible (${habitacion.estado})`,
      );
    }

    habitacion.estado = EstadoHabitacion.OCUPADA;
    await this.habRepo.save(habitacion);

    reserva.estado = EstadoReservacion.CHECK_IN;
    reserva.habitacionId = habitacion.id;
    reserva.fechaCheckInReal = new Date();
    await this.resRepo.save(reserva);

    const folio = await this.folioRepo.save(
      this.folioRepo.create({
        empresaId,
        reservacionId: reserva.id,
        estado: EstadoFolio.ABIERTO,
        total: 0,
      }),
    );

    // El folio se trabaja por noche: al check-in se postea solamente la
    // primera; la auditoría nocturna agrega las siguientes. Antes se cargaba
    // aquí toda la estancia y la auditoría volvía a cobrarla noche por noche.
    const noches = this.noches(reserva.fechaEntrada, reserva.fechaSalida);
    const importeHospedaje = Number(reserva.tarifaNoche);
    await this.cargoRepo.save(
      this.cargoRepo.create({
        empresaId,
        folioId: folio.id,
        tipo: TipoCargo.HOSPEDAJE,
        concepto: `Hospedaje — noche 1 de ${noches}`,
        cantidad: 1,
        precioUnitario: Number(reserva.tarifaNoche),
        importe: importeHospedaje,
        claveIdempotencia: `CHECKIN:${reserva.id}:NOCHE:1`,
      }),
    );
    folio.total = importeHospedaje;
    await this.folioRepo.save(folio);
    reserva.nochesPosteadas = 1;
    await this.resRepo.save(reserva);

    // Dotación inicial → descuenta inventario real
    const insumos = await this.descontarDotacion(
      reserva.tipoHabitacionId,
      habitacion,
      reserva.hotelId,
      empresaId,
    );

    return {
      ok: true,
      folioId: folio.id,
      consumiblesDescontados: insumos.consumibles,
      blancosEnUso: insumos.blancos,
      mensaje: `Check-in realizado. Folio abierto${insumos.consumibles > 0 ? `, ${insumos.consumibles} consumible(s) descontados` : ''}${insumos.blancos > 0 ? ` y ${insumos.blancos} blanco(s) en uso` : ''}.`,
    };
  }

  // ── DOTACIÓN → DESCUENTO DE INVENTARIO REAL ──────────────────────────────
  private async descontarDotacion(
    tipoHabitacionId: string,
    habitacion: Habitacion,
    hotelId: string,
    empresaId: string,
  ): Promise<{ consumibles: number; blancos: number }> {
    const dotacion = await this.dotRepo.find({
      where: { tipoHabitacionId, empresaId },
    });

    // Separar por tipo: los BLANCOS (sábanas/toallas) NO se descuentan del
    // inventario porque no se consumen, se lavan y regresan. Solo los
    // CONSUMIBLES (shampoo, agua, amenidades) salen del almacén.
    const consumibles = dotacion.filter(
      (d) => (d.tipoArticulo ?? 'CONSUMIBLE') === 'CONSUMIBLE',
    );
    const blancos = dotacion.filter((d) => d.tipoArticulo === 'BLANCO');

    const almacenId = await this.almacenDelHotel(hotelId, empresaId);
    if (!almacenId) {
      this.logger.warn(
        `Hotel sin almacén configurado; no se descuentan consumibles de habitación ${habitacion.numero}`,
      );
      return { consumibles: 0, blancos: blancos.length };
    }

    let ok = 0;
    for (const item of consumibles) {
      try {
        await this.inventarioService.registrarSalida(
          item.productoId,
          almacenId,
          Number(item.cantidad),
          `Consumibles habitación ${habitacion.numero}`,
          empresaId,
        );
        ok++;
      } catch (e) {
        this.logger.warn(
          `No se pudo descontar ${item.productoNombre ?? item.productoId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    // Los blancos solo se registran como "en uso" (no tocan inventario).
    // Su control fino (retiro de sucios, reposición) irá en el módulo de ropería.
    return { consumibles: ok, blancos: blancos.length };
  }

  // ── AGREGAR CONSUMO (descuenta inventario si es producto real) ───────────
  async agregarConsumo(
    reservacionId: string,
    dto: AgregarConsumoDto,
    empresaId: string,
  ) {
    const reserva = await this.obtenerReservacion(reservacionId, empresaId);
    const folio = await this.folioRepo.findOne({
      where: { reservacionId, empresaId, estado: EstadoFolio.ABIERTO },
    });
    if (!folio)
      throw new NotFoundException('No hay folio abierto para esta reservación');

    const importe = dto.cantidad * dto.precioUnitario;
    await this.cargoRepo.save(
      this.cargoRepo.create({
        empresaId,
        folioId: folio.id,
        tipo: TipoCargo.CONSUMO,
        concepto: dto.concepto,
        productoId: dto.productoId,
        cantidad: dto.cantidad,
        precioUnitario: dto.precioUnitario,
        importe,
      }),
    );
    folio.total = Number(folio.total) + importe;
    await this.folioRepo.save(folio);

    // Descontar inventario si el productoId es real (no el placeholder de ceros)
    const esProductoReal =
      dto.productoId && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(dto.productoId);
    let descontado = false;
    if (esProductoReal) {
      const almacenId = await this.almacenDelHotel(reserva.hotelId, empresaId);
      if (almacenId) {
        try {
          await this.inventarioService.registrarSalida(
            dto.productoId,
            almacenId,
            dto.cantidad,
            `Consumo folio ${reserva.codigo}`,
            empresaId,
          );
          descontado = true;
        } catch (e) {
          this.logger.warn(
            `Consumo no descontado de inventario: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }

    return {
      ok: true,
      totalFolio: folio.total,
      inventarioDescontado: descontado,
    };
  }

  async obtenerFolio(reservacionId: string, empresaId: string) {
    const folio = await this.folioRepo.findOne({
      where: { reservacionId, empresaId },
      relations: ['cargos'],
    });
    if (!folio) throw new NotFoundException('Folio no encontrado');
    return folio;
  }

  // ── CHECK-OUT ────────────────────────────────────────────────────────────
  async checkOut(reservacionId: string, empresaId: string) {
    const reserva = await this.obtenerReservacion(reservacionId, empresaId);
    if (reserva.estado !== EstadoReservacion.CHECK_IN) {
      throw new BadRequestException('La reservación no tiene check-in activo');
    }
    const folio = await this.folioRepo.findOne({
      where: { reservacionId, empresaId, estado: EstadoFolio.ABIERTO },
      relations: ['cargos'],
    });
    if (!folio) throw new NotFoundException('No hay folio abierto');

    folio.estado = EstadoFolio.CERRADO;
    folio.fechaCierre = new Date();
    await this.folioRepo.save(folio);

    let habitacionNumero: string | null = null;
    if (reserva.habitacionId) {
      const hab = await this.habRepo.findOne({
        where: { id: reserva.habitacionId },
      });
      if (hab) {
        hab.estado = EstadoHabitacion.LIMPIEZA;
        await this.habRepo.save(hab);
        habitacionNumero = hab.numero;
        await this.tareaRepo.save(
          this.tareaRepo.create({
            empresaId,
            habitacionId: hab.id,
            habitacionNumero: hab.numero,
            tipo: TipoLimpieza.SALIDA,
            estado: EstadoTarea.PENDIENTE,
          }),
        );
      }
    }

    reserva.estado = EstadoReservacion.CHECK_OUT;
    reserva.fechaCheckOutReal = new Date();
    await this.resRepo.save(reserva);

    // ── Generar la póliza de ingreso por hospedaje ──────────────────────
    // El total del folio incluye hospedaje + consumos. Calculamos el IVA
    // contenido (16%). total = base * 1.16  →  iva = total - total/1.16
    let polizaGenerada = false;
    const total = Number(folio.total);
    if (total > 0) {
      const iva = Math.round((total - total / 1.16) * 100) / 100;
      await this.asientos.intentar(
        TipoAsiento.HOSPEDAJE,
        {
          documentoId: reserva.id,
          empresaId,
          folio: reserva.codigo ?? `RES-${reserva.id.slice(0, 8)}`,
          fecha: new Date(),
          total,
          iva,
          metodoPago: 'EFECTIVO', // TODO: capturar método de pago real en el check-out
          esCredito: false,
        },
        empresaId,
        reserva.codigo ?? reserva.id.slice(0, 8),
        reserva.id,
      );
      polizaGenerada = true;
    }

    return {
      ok: true,
      totalCobrado: folio.total,
      habitacion: habitacionNumero,
      polizaGenerada,
      mensaje: `Check-out realizado. Folio cerrado${polizaGenerada ? ', ingreso contabilizado' : ''} y habitación enviada a limpieza.`,
    };
  }
}
