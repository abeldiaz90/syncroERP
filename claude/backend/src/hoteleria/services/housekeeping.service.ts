// hoteleria/services/housekeeping.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  TareaHousekeeping,
  EstadoTarea,
} from '../entities/tarea-housekeeping.entity';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import {
  AsignarCamaristaDto,
  InspeccionarTareaDto,
} from '../dto/hoteleria.dtos';
import { Usuario } from '../../iam/entities/usuario.entity';

@Injectable()
export class HousekeepingService {
  constructor(
    @InjectRepository(TareaHousekeeping)
    private readonly tareaRepo: Repository<TareaHousekeeping>,
    @InjectRepository(Habitacion)
    private readonly habRepo: Repository<Habitacion>,
    private readonly dataSource: DataSource,
  ) {}

  // ── RACK: estado de todas las habitaciones de un hotel ───────────────────
  async obtenerRack(hotelId: string, empresaId: string) {
    const habitaciones = await this.habRepo.find({
      where: { hotelId, empresaId },
      relations: ['tipoHabitacion'],
      order: { piso: 'ASC', numero: 'ASC' },
    });

    // Resumen por estado (para los contadores del tablero)
    const resumen = {
      total: habitaciones.length,
      disponibles: habitaciones.filter(
        (h) => h.estado === EstadoHabitacion.DISPONIBLE,
      ).length,
      ocupadas: habitaciones.filter(
        (h) => h.estado === EstadoHabitacion.OCUPADA,
      ).length,
      limpieza: habitaciones.filter(
        (h) => h.estado === EstadoHabitacion.LIMPIEZA,
      ).length,
      inspeccion: habitaciones.filter(
        (h) => h.estado === EstadoHabitacion.INSPECCION,
      ).length,
      mantenimiento: habitaciones.filter(
        (h) => h.estado === EstadoHabitacion.MANTENIMIENTO,
      ).length,
    };

    return { resumen, habitaciones };
  }

  // ── TAREAS DE LIMPIEZA ───────────────────────────────────────────────────
  obtenerTareas(empresaId: string, estado?: EstadoTarea) {
    const where: any = { empresaId };
    if (estado) where.estado = estado;
    return this.tareaRepo.find({ where, order: { fechaCreacion: 'DESC' } });
  }

  async asignarCamarista(
    tareaId: string,
    dto: AsignarCamaristaDto,
    empresaId: string,
  ) {
    const tarea = await this.tareaRepo.findOne({
      where: { id: tareaId, empresaId },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    if (dto.asignadoAId) {
      const usuario = await this.dataSource.getRepository(Usuario).findOne({
        where: { id: dto.asignadoAId, empresaId, activo: true },
      });
      if (!usuario) {
        throw new BadRequestException(
          'La camarista no existe, está inactiva o pertenece a otra empresa.',
        );
      }
    }
    tarea.asignadoAId = dto.asignadoAId ?? null;
    tarea.asignadoANombre = dto.asignadoANombre ?? null;
    return this.tareaRepo.save(tarea);
  }

  async iniciarTarea(tareaId: string, empresaId: string) {
    const tarea = await this.tareaRepo.findOne({
      where: { id: tareaId, empresaId },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');
    if (tarea.estado !== EstadoTarea.PENDIENTE) {
      throw new BadRequestException(
        'Sólo una tarea pendiente puede iniciarse.',
      );
    }
    tarea.estado = EstadoTarea.EN_PROCESO;
    tarea.fechaInicio = new Date();
    return this.tareaRepo.save(tarea);
  }

  // Terminar limpieza → habitación queda pendiente de inspección.
  async terminarTarea(tareaId: string, empresaId: string) {
    return this.dataSource.transaction(async (manager) => {
      const tarea = await manager
        .getRepository(TareaHousekeeping)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id=:id AND t.empresaId=:empresaId', {
          id: tareaId,
          empresaId,
        })
        .getOne();
      if (!tarea) throw new NotFoundException('Tarea no encontrada');
      if (tarea.estado !== EstadoTarea.EN_PROCESO) {
        throw new BadRequestException(
          'La limpieza debe iniciarse antes de marcarla como terminada.',
        );
      }
      tarea.estado = EstadoTarea.TERMINADA;
      tarea.fechaTermino = new Date();
      await manager.save(tarea);

      const hab = await manager.getRepository(Habitacion).findOne({
        where: { id: tarea.habitacionId, empresaId },
      });
      if (hab && hab.estado === EstadoHabitacion.LIMPIEZA) {
        hab.estado = EstadoHabitacion.INSPECCION;
        await manager.save(hab);
      }
      return {
        ok: true,
        mensaje: 'Limpieza terminada. La habitación espera inspección.',
      };
    });
  }

  async inspeccionarTarea(
    tareaId: string,
    dto: InspeccionarTareaDto,
    empresaId: string,
    usuarioId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const tarea = await manager
        .getRepository(TareaHousekeeping)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id=:id AND t.empresaId=:empresaId', {
          id: tareaId,
          empresaId,
        })
        .getOne();
      if (!tarea) throw new NotFoundException('Tarea no encontrada');
      if (tarea.estado !== EstadoTarea.TERMINADA) {
        throw new BadRequestException(
          'Sólo una limpieza terminada puede inspeccionarse.',
        );
      }
      const habitacion = await manager.getRepository(Habitacion).findOne({
        where: { id: tarea.habitacionId, empresaId },
      });
      if (!habitacion) throw new NotFoundException('Habitación no encontrada');

      tarea.inspeccionadoPorId = usuarioId ?? null;
      tarea.fechaInspeccion = new Date();
      tarea.comentarioInspeccion = dto.comentario?.trim() || null;
      if (dto.aprobado) {
        tarea.estado = EstadoTarea.INSPECCIONADA;
        habitacion.estado = EstadoHabitacion.DISPONIBLE;
      } else {
        tarea.estado = EstadoTarea.PENDIENTE;
        tarea.fechaInicio = null;
        tarea.fechaTermino = null;
        habitacion.estado = EstadoHabitacion.LIMPIEZA;
      }
      await manager.save(tarea);
      await manager.save(habitacion);
      return {
        ok: true,
        aprobado: dto.aprobado,
        mensaje: dto.aprobado
          ? 'Inspección aprobada. Habitación disponible.'
          : 'Inspección rechazada. La habitación regresa a limpieza.',
      };
    });
  }

  // ── FLUJO DE ESTADOS VÁLIDOS ─────────────────────────────────────────────
  // Define a qué estados puede pasar una habitación desde su estado actual.
  // El ciclo normal es:
  //   DISPONIBLE →(check-in)→ OCUPADA →(check-out)→ LIMPIEZA →(limpieza)→
  //   INSPECCION →(supervisa)→ DISPONIBLE
  // Además, MANTENIMIENTO y BLOQUEADA pueden activarse/desactivarse desde
  // estados que no tengan huésped dentro.
  private static readonly TRANSICIONES: Record<string, string[]> = {
    // DISPONIBLE: se puede bloquear o mandar a mantenimiento. La ocupación
    // NO es manual: ocurre solo al hacer CHECK-IN desde reservaciones.
    DISPONIBLE: ['MANTENIMIENTO', 'BLOQUEADA'],
    // OCUPADA: NO tiene transiciones manuales. La única forma de sacarla de
    // este estado es el CHECK-OUT formal (que cierra folio y contabiliza).
    // Por eso su lista está vacía: el rack no ofrece ningún botón.
    OCUPADA: [],
    // Limpieza e inspección avanzan mediante sus tareas auditables, no desde
    // el rack; así no se puede liberar una habitación saltándose al supervisor.
    LIMPIEZA: [],
    INSPECCION: [],
    MANTENIMIENTO: ['DISPONIBLE', 'BLOQUEADA'],
    BLOQUEADA: ['DISPONIBLE', 'MANTENIMIENTO'],
  };

  // Estados que exige el sistema internamente (no el usuario a mano).
  // check-in pone OCUPADA; check-out pone LIMPIEZA. Estos NO pasan por la
  // validación de transiciones manuales.
  private static readonly ESTADOS_INTERNOS = ['OCUPADA', 'LIMPIEZA'];

  /** Devuelve los estados a los que una habitación puede pasar (para la UI) */
  transicionesValidas(estadoActual: string): string[] {
    return HousekeepingService.TRANSICIONES[estadoActual] ?? [];
  }

  // Cambiar estado de habitación respetando el flujo válido
  async cambiarEstadoHabitacion(
    habitacionId: string,
    estado: EstadoHabitacion,
    empresaId: string,
  ) {
    const hab = await this.habRepo.findOne({
      where: { id: habitacionId, empresaId },
    });
    if (!hab) throw new NotFoundException('Habitación no encontrada');

    const actual = hab.estado;
    const destino = estado as string;

    // Si es el mismo estado, no hacer nada
    if (actual === destino) return hab;

    const permitidas = HousekeepingService.TRANSICIONES[actual] ?? [];
    if (!permitidas.includes(destino)) {
      throw new BadRequestException(
        `No se puede pasar de ${actual} a ${destino}. Transiciones válidas: ${permitidas.join(', ') || 'ninguna'}.`,
      );
    }

    hab.estado = estado;
    return this.habRepo.save(hab);
  }
}
