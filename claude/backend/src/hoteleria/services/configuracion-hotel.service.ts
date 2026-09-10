import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Hotel } from '../entities/hotel.entity';
import { TipoHabitacion } from '../entities/tipo-habitacion.entity';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import { DotacionTipoHabitacion } from '../entities/dotacion-tipo-habitacion.entity';
import {
  ActualizarHabitacionDto,
  ActualizarHotelDto,
  ActualizarTipoHabitacionDto,
  CrearHabitacionDto,
  CrearHabitacionesLoteDto,
  CrearHotelDto,
  CrearTipoHabitacionDto,
  GuardarDotacionDto,
} from '../dto/hoteleria.dtos';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

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
    private readonly dataSource: DataSource,
  ) {}

  async crearHotel(dto: CrearHotelDto, empresaId: string) {
    const existe = await this.hotelRepo.findOne({
      where: { empresaId, nombre: dto.nombre },
    });
    if (existe)
      throw new ConflictException('Ya existe una propiedad con ese nombre.');
    const zona = dto.zonaHoraria ?? 'America/Mexico_City';
    try {
      new Intl.DateTimeFormat('es-MX', { timeZone: zona }).format(new Date());
    } catch {
      throw new BadRequestException('La zona horaria no es válida.');
    }
    await this.validarAlmacen(dto.almacenId, empresaId);
    return this.hotelRepo.save(
      this.hotelRepo.create({
        ...dto,
        empresaId,
        activo: true,
        zonaHoraria: zona,
        moneda: (dto.moneda ?? 'MXN').toUpperCase(),
        tasaIva: dto.tasaIva ?? 16,
        tasaImpuestoHospedaje: dto.tasaImpuestoHospedaje ?? 0,
        nombreImpuestoHospedaje:
          dto.nombreImpuestoHospedaje ?? 'Impuesto sobre hospedaje',
        preciosIncluyenImpuestos: dto.preciosIncluyenImpuestos ?? true,
        exigirInventarioDotacion: dto.exigirInventarioDotacion ?? true,
        permitirSobreventa: dto.permitirSobreventa ?? false,
        fechaOperativa: fechaCalendarioNegocio(new Date(), zona),
      }),
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
    dto: ActualizarHotelDto,
    empresaId: string,
  ) {
    const hotel = await this.hotelRepo.findOne({ where: { id, empresaId } });
    if (!hotel) throw new NotFoundException('Hotel no encontrado.');
    if (dto.nombre && dto.nombre !== hotel.nombre) {
      const repetido = await this.hotelRepo.findOne({
        where: { empresaId, nombre: dto.nombre },
      });
      if (repetido && repetido.id !== id)
        throw new ConflictException('Ya existe otra propiedad con ese nombre.');
    }
    if (dto.zonaHoraria) {
      try {
        new Intl.DateTimeFormat('es-MX', { timeZone: dto.zonaHoraria }).format(
          new Date(),
        );
      } catch {
        throw new BadRequestException('La zona horaria no es válida.');
      }
    }
    await this.validarAlmacen(dto.almacenId, empresaId);
    Object.assign(hotel, dto, {
      moneda: dto.moneda?.toUpperCase() ?? hotel.moneda,
    });
    return this.hotelRepo.save(hotel);
  }

  async crearTipo(dto: CrearTipoHabitacionDto, empresaId: string) {
    const hotel = await this.hotelRepo.findOne({
      where: { id: dto.hotelId, empresaId, activo: true },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado.');
    const existe = await this.tipoRepo.findOne({
      where: { empresaId, hotelId: dto.hotelId, nombre: dto.nombre },
    });
    if (existe)
      throw new ConflictException(
        'Ya existe ese tipo de habitación en el hotel.',
      );
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
    dto: ActualizarTipoHabitacionDto,
    empresaId: string,
  ) {
    const tipo = await this.tipoRepo.findOne({ where: { id, empresaId } });
    if (!tipo) throw new NotFoundException('Tipo de habitación no encontrado.');
    if (dto.nombre && dto.nombre !== tipo.nombre) {
      const repetido = await this.tipoRepo.findOne({
        where: { empresaId, hotelId: tipo.hotelId, nombre: dto.nombre },
      });
      if (repetido && repetido.id !== id) {
        throw new ConflictException(
          'Ya existe ese tipo de habitación en el hotel.',
        );
      }
    }
    Object.assign(tipo, dto);
    return this.tipoRepo.save(tipo);
  }

  async crearHabitacion(dto: CrearHabitacionDto, empresaId: string) {
    await this.validarHotelYTipo(dto.hotelId, dto.tipoHabitacionId, empresaId);
    const existe = await this.habRepo.findOne({
      where: { empresaId, hotelId: dto.hotelId, numero: dto.numero },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe la habitación ${dto.numero} en este hotel.`,
      );
    return this.habRepo.save(
      this.habRepo.create({
        ...dto,
        empresaId,
        activo: true,
        estado: EstadoHabitacion.DISPONIBLE,
      }),
    );
  }

  async crearHabitacionesLote(
    dto: CrearHabitacionesLoteDto,
    empresaId: string,
  ) {
    if (dto.hasta < dto.desde || dto.hasta - dto.desde > 500) {
      throw new BadRequestException(
        'El rango es inválido o supera 500 habitaciones.',
      );
    }
    await this.validarHotelYTipo(dto.hotelId, dto.tipoHabitacionId, empresaId);
    return this.dataSource.transaction(async (manager) => {
      const existentes = await manager.getRepository(Habitacion).find({
        where: { empresaId, hotelId: dto.hotelId },
        select: ['numero'],
      });
      const usados = new Set(existentes.map((h) => h.numero));
      const nuevas: Habitacion[] = [];
      for (let n = dto.desde; n <= dto.hasta; n++) {
        const numero = String(n);
        if (!usados.has(numero)) {
          nuevas.push(
            manager.getRepository(Habitacion).create({
              empresaId,
              hotelId: dto.hotelId,
              tipoHabitacionId: dto.tipoHabitacionId,
              piso: dto.piso,
              numero,
              activo: true,
              estado: EstadoHabitacion.DISPONIBLE,
            }),
          );
        }
      }
      if (nuevas.length) await manager.getRepository(Habitacion).save(nuevas);
      return {
        creadas: nuevas.length,
        omitidas: dto.hasta - dto.desde + 1 - nuevas.length,
      };
    });
  }

  obtenerHabitaciones(hotelId: string, empresaId: string) {
    return this.habRepo.find({
      where: { hotelId, empresaId },
      relations: ['tipoHabitacion'],
      order: { numero: 'ASC' },
    });
  }

  async actualizarHabitacion(
    id: string,
    dto: ActualizarHabitacionDto,
    empresaId: string,
  ) {
    const habitacion = await this.habRepo.findOne({ where: { id, empresaId } });
    if (!habitacion) throw new NotFoundException('Habitación no encontrada.');
    if (dto.tipoHabitacionId)
      await this.validarHotelYTipo(
        habitacion.hotelId,
        dto.tipoHabitacionId,
        empresaId,
      );
    if (dto.numero && dto.numero !== habitacion.numero) {
      const repetida = await this.habRepo.findOne({
        where: { empresaId, hotelId: habitacion.hotelId, numero: dto.numero },
      });
      if (repetida && repetida.id !== id)
        throw new ConflictException(
          'Ya existe otra habitación con ese número.',
        );
    }
    Object.assign(habitacion, dto);
    return this.habRepo.save(habitacion);
  }

  private async validarHotelYTipo(
    hotelId: string,
    tipoId: string,
    empresaId: string,
  ) {
    const [hotel, tipo] = await Promise.all([
      this.hotelRepo.findOne({
        where: { id: hotelId, empresaId, activo: true },
      }),
      this.tipoRepo.findOne({
        where: { id: tipoId, hotelId, empresaId, activo: true },
      }),
    ]);
    if (!hotel) throw new NotFoundException('Hotel no encontrado o inactivo.');
    if (!tipo)
      throw new BadRequestException(
        'El tipo no pertenece al hotel o está inactivo.',
      );
  }

  async guardarDotacion(dto: GuardarDotacionDto, empresaId: string) {
    const tipo = await this.tipoRepo.findOne({
      where: { id: dto.tipoHabitacionId, empresaId },
    });
    if (!tipo) throw new NotFoundException('Tipo de habitación no encontrado.');
    const duplicados = dto.items
      .map((i) => i.productoId)
      .filter((id, i, a) => a.indexOf(id) !== i);
    if (duplicados.length)
      throw new BadRequestException(
        'La dotación contiene productos duplicados.',
      );
    return this.dataSource.transaction(async (manager) => {
      const ids = dto.items.map((item) => item.productoId);
      const productos = ids.length
        ? await manager.getRepository(Producto).find({
            where: { id: In(ids), empresaId, activo: true },
            select: ['id', 'nombre'],
          })
        : [];
      if (productos.length !== new Set(ids).size) {
        throw new BadRequestException(
          'La dotación contiene productos inexistentes, inactivos o pertenecientes a otra empresa.',
        );
      }
      const nombres = new Map(
        productos.map((producto) => [producto.id, producto.nombre]),
      );
      await manager
        .getRepository(DotacionTipoHabitacion)
        .delete({ tipoHabitacionId: dto.tipoHabitacionId, empresaId });
      const nuevas = dto.items.map((item) =>
        manager.getRepository(DotacionTipoHabitacion).create({
          empresaId,
          tipoHabitacionId: dto.tipoHabitacionId,
          productoId: item.productoId,
          productoNombre: nombres.get(item.productoId) ?? null,
          cantidad: item.cantidad,
          tipoArticulo: item.tipoArticulo ?? 'CONSUMIBLE',
        }),
      );
      if (nuevas.length)
        await manager.getRepository(DotacionTipoHabitacion).save(nuevas);
      return { ok: true, items: nuevas.length };
    });
  }

  private async validarAlmacen(
    almacenId: string | null | undefined,
    empresaId: string,
  ): Promise<void> {
    if (!almacenId) return;
    const almacen = await this.dataSource.getRepository(Almacen).findOne({
      where: { id: almacenId, empresaId, activo: true },
    });
    if (!almacen) {
      throw new BadRequestException(
        'El almacén no existe, está inactivo o pertenece a otra empresa.',
      );
    }
  }

  obtenerDotacion(tipoHabitacionId: string, empresaId: string) {
    return this.dotRepo.find({
      where: { tipoHabitacionId, empresaId },
      order: { productoId: 'ASC' },
    });
  }

  async precargarDemo(empresaId: string) {
    const existente = await this.hotelRepo.findOne({
      where: { empresaId, nombre: 'Hotel Demo Central' },
    });
    if (existente) return { ok: true, yaExistia: true, hotelId: existente.id };
    const hotel = await this.crearHotel(
      {
        nombre: 'Hotel Demo Central',
        direccion: 'Av. Reforma 100',
        ciudad: 'CDMX',
        estadoRepublica: 'Ciudad de México',
        telefono: '55-1234-5678',
        tasaIva: 16,
        tasaImpuestoHospedaje: 3.5,
        preciosIncluyenImpuestos: true,
        exigirInventarioDotacion: false,
      },
      empresaId,
    );
    const tipos = [];
    for (const item of [
      { nombre: 'Sencilla', capacidad: 2, tarifaBase: 850 },
      { nombre: 'Doble', capacidad: 4, tarifaBase: 1350 },
      { nombre: 'Suite', capacidad: 4, tarifaBase: 2500 },
    ])
      tipos.push(
        await this.crearTipo({ hotelId: hotel.id, ...item }, empresaId),
      );
    let creadas = 0;
    for (let i = 0; i < tipos.length; i++) {
      const r = await this.crearHabitacionesLote(
        {
          hotelId: hotel.id,
          tipoHabitacionId: tipos[i].id,
          piso: i + 1,
          desde: (i + 1) * 100 + 1,
          hasta: (i + 1) * 100 + 8,
        },
        empresaId,
      );
      creadas += r.creadas;
    }
    return {
      ok: true,
      yaExistia: false,
      hotelId: hotel.id,
      habitaciones: creadas,
    };
  }
}
