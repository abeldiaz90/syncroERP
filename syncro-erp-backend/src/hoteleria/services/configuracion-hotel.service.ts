// hoteleria/services/configuracion-hotel.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hotel } from '../entities/hotel.entity';
import { TipoHabitacion } from '../entities/tipo-habitacion.entity';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import { DotacionTipoHabitacion } from '../entities/dotacion-tipo-habitacion.entity';
import {
  CrearHotelDto,
  CrearTipoHabitacionDto,
  CrearHabitacionDto,
  GuardarDotacionDto,
} from '../dto/hoteleria.dtos';

@Injectable()
export class ConfiguracionHotelService {
  constructor(
    @InjectRepository(Hotel) private readonly hotelRepo: Repository<Hotel>,
    @InjectRepository(TipoHabitacion)
    private readonly tipoRepo: Repository<TipoHabitacion>,
    @InjectRepository(Habitacion)
    private readonly habRepo: Repository<Habitacion>,
    @InjectRepository(DotacionTipoHabitacion)
    private readonly dotRepo: Repository<DotacionTipoHabitacion>,
  ) {}

  // ── HOTELES ──────────────────────────────────────────────────────────────
  crearHotel(dto: CrearHotelDto, empresaId: string) {
    return this.hotelRepo.save(
      this.hotelRepo.create({ ...dto, empresaId, activo: true }),
    );
  }

  obtenerHoteles(empresaId: string) {
    return this.hotelRepo.find({
      where: { empresaId },
      order: { nombre: 'ASC' },
    });
  }

  async actualizarHotel(
    id: string,
    dto: Partial<CrearHotelDto>,
    empresaId: string,
  ) {
    const hotel = await this.hotelRepo.findOne({ where: { id, empresaId } });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');
    Object.assign(hotel, dto);
    return this.hotelRepo.save(hotel);
  }

  // ── TIPOS DE HABITACIÓN ──────────────────────────────────────────────────
  crearTipo(dto: CrearTipoHabitacionDto, empresaId: string) {
    return this.tipoRepo.save(
      this.tipoRepo.create({ ...dto, empresaId, activo: true }),
    );
  }

  obtenerTipos(hotelId: string, empresaId: string) {
    return this.tipoRepo.find({
      where: { hotelId, empresaId },
      order: { nombre: 'ASC' },
    });
  }

  async actualizarTipo(
    id: string,
    dto: Partial<CrearTipoHabitacionDto>,
    empresaId: string,
  ) {
    const tipo = await this.tipoRepo.findOne({ where: { id, empresaId } });
    if (!tipo) throw new NotFoundException('Tipo de habitación no encontrado');
    Object.assign(tipo, dto);
    return this.tipoRepo.save(tipo);
  }

  // ── HABITACIONES ─────────────────────────────────────────────────────────
  async crearHabitacion(dto: CrearHabitacionDto, empresaId: string) {
    const existe = await this.habRepo.findOne({
      where: { hotelId: dto.hotelId, numero: dto.numero },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe la habitación ${dto.numero} en este hotel`,
      );
    return this.habRepo.save(
      this.habRepo.create({ ...dto, empresaId, activo: true }),
    );
  }

  /** Crea varias habitaciones de golpe (ej. 101-110 del piso 1) */
  async crearHabitacionesLote(
    hotelId: string,
    tipoHabitacionId: string,
    piso: number,
    desde: number,
    hasta: number,
    empresaId: string,
  ) {
    const creadas: Habitacion[] = [];
    for (let n = desde; n <= hasta; n++) {
      const numero = String(n);
      const existe = await this.habRepo.findOne({ where: { hotelId, numero } });
      if (!existe) {
        creadas.push(
          this.habRepo.create({
            hotelId,
            tipoHabitacionId,
            piso,
            numero,
            empresaId,
            activo: true,
          }),
        );
      }
    }
    if (creadas.length) await this.habRepo.save(creadas);
    return { creadas: creadas.length };
  }

  obtenerHabitaciones(hotelId: string, empresaId: string) {
    return this.habRepo.find({
      where: { hotelId, empresaId },
      relations: ['tipoHabitacion'],
      order: { numero: 'ASC' },
    });
  }

  async actualizarHabitacion(id: string, dto: any, empresaId: string) {
    const hab = await this.habRepo.findOne({ where: { id, empresaId } });
    if (!hab) throw new NotFoundException('Habitación no encontrada');
    Object.assign(hab, dto);
    return this.habRepo.save(hab);
  }

  // ── DOTACIÓN DE INSUMOS POR TIPO ─────────────────────────────────────────
  async guardarDotacion(dto: GuardarDotacionDto, empresaId: string) {
    const items = Array.isArray(dto.items) ? dto.items : [];
    // Reemplaza la dotación completa del tipo
    await this.dotRepo.delete({
      tipoHabitacionId: dto.tipoHabitacionId,
      empresaId,
    });
    const nuevas = items.map((it) =>
      this.dotRepo.create({
        empresaId,
        tipoHabitacionId: dto.tipoHabitacionId,
        productoId: it.productoId,
        productoNombre: it.productoNombre ?? null,
        cantidad: it.cantidad,
        tipoArticulo: it.tipoArticulo ?? 'CONSUMIBLE',
      }),
    );
    if (nuevas.length) await this.dotRepo.save(nuevas);
    return { ok: true, items: nuevas.length };
  }

  obtenerDotacion(tipoHabitacionId: string, empresaId: string) {
    return this.dotRepo.find({ where: { tipoHabitacionId, empresaId } });
  }

  // ── PRECARGA DEMO ────────────────────────────────────────────────────────
  async precargarDemo(empresaId: string) {
    const YA = await this.hotelRepo.findOne({
      where: { empresaId, nombre: 'Hotel Demo Central' },
    });
    if (YA) return { ok: true, yaExistia: true, hotelId: YA.id };

    const hotel = await this.hotelRepo.save(
      this.hotelRepo.create({
        empresaId,
        nombre: 'Hotel Demo Central',
        direccion: 'Av. Reforma 100',
        ciudad: 'CDMX',
        telefono: '55-1234-5678',
        horaCheckIn: '15:00',
        horaCheckOut: '12:00',
        activo: true,
      }),
    );

    const tSencilla = await this.tipoRepo.save(
      this.tipoRepo.create({
        empresaId,
        hotelId: hotel.id,
        nombre: 'Sencilla',
        capacidad: 2,
        tarifaBase: 850,
        activo: true,
      }),
    );
    const tDoble = await this.tipoRepo.save(
      this.tipoRepo.create({
        empresaId,
        hotelId: hotel.id,
        nombre: 'Doble',
        capacidad: 4,
        tarifaBase: 1350,
        activo: true,
      }),
    );
    const tSuite = await this.tipoRepo.save(
      this.tipoRepo.create({
        empresaId,
        hotelId: hotel.id,
        nombre: 'Suite',
        capacidad: 4,
        tarifaBase: 2500,
        activo: true,
      }),
    );

    const habs: Habitacion[] = [];
    const pisos = [
      { piso: 1, tipo: tSencilla.id, base: 100 },
      { piso: 2, tipo: tDoble.id, base: 200 },
      { piso: 3, tipo: tSuite.id, base: 300 },
    ];
    for (const p of pisos) {
      for (let i = 1; i <= 8; i++) {
        const numero = String(p.base + i);
        let estado: EstadoHabitacion = EstadoHabitacion.DISPONIBLE;
        if (i === 2 || i === 5) estado = EstadoHabitacion.OCUPADA;
        else if (i === 3) estado = EstadoHabitacion.LIMPIEZA;
        else if (i === 7) estado = EstadoHabitacion.MANTENIMIENTO;
        habs.push(
          this.habRepo.create({
            empresaId,
            hotelId: hotel.id,
            tipoHabitacionId: p.tipo,
            numero,
            piso: p.piso,
            estado,
            activo: true,
          }),
        );
      }
    }
    await this.habRepo.save(habs);
    return {
      ok: true,
      yaExistia: false,
      hotelId: hotel.id,
      habitaciones: habs.length,
    };
  }
}
