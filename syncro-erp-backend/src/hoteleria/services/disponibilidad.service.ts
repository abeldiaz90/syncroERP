import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';
import { Habitacion, EstadoHabitacion } from '../entities/habitacion.entity';
import { TipoHabitacion } from '../entities/tipo-habitacion.entity';

/**
 * ============================================================================
 * SyncroERP · Disponibilidad hotelera
 * ----------------------------------------------------------------------------
 * EL PROBLEMA QUE RESUELVE
 *
 * `crearReservacion()` validaba UNA sola cosa: que la fecha de salida fuera
 * posterior a la de entrada. No consultaba cuántas habitaciones existen de ese
 * tipo, ni cuántas ya estaban comprometidas para esas fechas.
 *
 * Con 12 habitaciones dobles se podían vender 40 reservaciones para el 31 de
 * diciembre sin que el sistema dijera una palabra. La única validación ocurría
 * en el check-in — cuando el huésped ya está frente al mostrador.
 *
 * ── LA CONDICIÓN DE TRASLAPE ───────────────────────────────────────────────
 *
 * Dos estancias chocan cuando:
 *
 *     entradaA < salidaB   Y   entradaB < salidaA
 *
 * Es importante que sean `<` estrictos y no `<=`: el día de salida la
 * habitación queda libre para el siguiente huésped. Alguien que sale el 15
 * no estorba a quien entra el 15. Usar `<=` bloquearía una noche por cada
 * reservación y con el hotel lleno se pierden decenas de noches vendibles.
 *
 * ── OVERBOOKING DELIBERADO ─────────────────────────────────────────────────
 *
 * Los hoteles sobrevenden a propósito para cubrir no-shows. Aquí es una
 * decisión configurable con tope, no un accidente: `permitirSobreventa` con un
 * porcentaje explícito. Sin la bandera, el sistema no deja pasar de la
 * capacidad real.
 * ============================================================================
 */

export interface DisponibilidadTipo {
  tipoHabitacionId: string;
  nombre: string;
  tarifaBase: number;
  capacidadTotal: number;
  fueraDeServicio: number;
  comprometidas: number;
  disponibles: number;
  hayCupo: boolean;
}

export interface ConsultaDisponibilidad {
  fechaEntrada: string;
  fechaSalida: string;
  noches: number;
  tipos: DisponibilidadTipo[];
}

/** Estados que apartan una habitación. Canceladas y no-show no cuentan. */
const ESTADOS_QUE_COMPROMETEN = [
  EstadoReservacion.CONFIRMADA,
  EstadoReservacion.CHECK_IN,
];

@Injectable()
export class DisponibilidadService {
  private readonly logger = new Logger(DisponibilidadService.name);

  constructor(
    @InjectRepository(Reservacion)
    private readonly resRepo: Repository<Reservacion>,
    @InjectRepository(Habitacion)
    private readonly habRepo: Repository<Habitacion>,
    @InjectRepository(TipoHabitacion)
    private readonly tipoRepo: Repository<TipoHabitacion>,
    private readonly dataSource: DataSource,
  ) {}

  /* ══ CONSULTA ════════════════════════════════════════════════════════════ */

  /**
   * Cuántas habitaciones quedan libres de cada tipo en el rango dado.
   * Es lo que recepción necesita ver ANTES de prometerle algo a un huésped.
   */
  async consultar(
    empresaId: string,
    fechaEntrada: string,
    fechaSalida: string,
    hotelId?: string,
  ): Promise<ConsultaDisponibilidad> {
    const entrada = new Date(fechaEntrada);
    const salida = new Date(fechaSalida);

    if (Number.isNaN(entrada.getTime()) || Number.isNaN(salida.getTime())) {
      throw new BadRequestException('Las fechas no son válidas.');
    }
    if (salida <= entrada) {
      throw new BadRequestException(
        'La fecha de salida debe ser posterior a la de entrada.',
      );
    }

    const tipos = await this.tipoRepo.find({
      where: { empresaId, activo: true, ...(hotelId ? { hotelId } : {}) },
      order: { tarifaBase: 'ASC' },
    });

    const resultado: DisponibilidadTipo[] = [];

    for (const tipo of tipos) {
      const { total, fueraDeServicio } = await this.contarHabitaciones(
        tipo.id,
        empresaId,
      );
      const comprometidas = await this.contarComprometidas(
        tipo.id,
        entrada,
        salida,
        empresaId,
      );

      const capacidadUtil = total - fueraDeServicio;
      const disponibles = Math.max(0, capacidadUtil - comprometidas);

      resultado.push({
        tipoHabitacionId: tipo.id,
        nombre: tipo.nombre,
        tarifaBase: Number(tipo.tarifaBase),
        capacidadTotal: total,
        fueraDeServicio,
        comprometidas,
        disponibles,
        hayCupo: disponibles > 0,
      });
    }

    const noches = Math.round(
      (salida.getTime() - entrada.getTime()) / 86_400_000,
    );

    return { fechaEntrada, fechaSalida, noches, tipos: resultado };
  }

  private async contarHabitaciones(
    tipoHabitacionId: string,
    empresaId: string,
  ) {
    const habitaciones = await this.habRepo.find({
      where: { tipoHabitacionId, empresaId },
    });

    return {
      total: habitaciones.length,
      // Mantenimiento y bloqueadas no se pueden vender.
      fueraDeServicio: habitaciones.filter(
        (h) =>
          h.estado === EstadoHabitacion.MANTENIMIENTO ||
          h.estado === EstadoHabitacion.BLOQUEADA,
      ).length,
    };
  }

  /**
   * Reservaciones vivas que se traslapan con el rango.
   *
   * `entrada < salidaOtra AND entradaOtra < salida`
   * Estrictos a propósito: el día de salida la habitación queda libre.
   */
  private async contarComprometidas(
    tipoHabitacionId: string,
    entrada: Date,
    salida: Date,
    empresaId: string,
    manager?: EntityManager,
    excluirReservacionId?: string,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(Reservacion) : this.resRepo;

    const q = repo
      .createQueryBuilder('r')
      .where('r.empresaId = :empresaId', { empresaId })
      .andWhere('r.tipoHabitacionId = :tipoHabitacionId', { tipoHabitacionId })
      .andWhere('r.estado IN (:...estados)', {
        estados: ESTADOS_QUE_COMPROMETEN,
      })
      .andWhere('r.fechaEntrada < :salida', { salida })
      .andWhere('r.fechaSalida > :entrada', { entrada });

    if (excluirReservacionId) {
      q.andWhere('r.id != :excluir', { excluir: excluirReservacionId });
    }

    return q.getCount();
  }

  /* ══ VALIDACIÓN AL RESERVAR ══════════════════════════════════════════════ */

  /**
   * Confirma que hay cupo y lo aparta, dentro de la transacción de la reserva.
   *
   * El bloqueo pesimista sobre las habitaciones del tipo es lo que impide que
   * dos recepcionistas vendan la última al mismo tiempo. Sin él, ambos leerían
   * "queda 1" y ambos venderían.
   */
  async validarCupo(
    datos: {
      tipoHabitacionId: string;
      fechaEntrada: Date;
      fechaSalida: Date;
      permitirSobreventa?: boolean;
      porcentajeSobreventa?: number;
      excluirReservacionId?: string;
    },
    empresaId: string,
    manager: EntityManager,
  ): Promise<{ disponibles: number; sobreventa: boolean }> {
    // Bloquea las habitaciones del tipo mientras se decide.
    const habitaciones = await manager
      .createQueryBuilder(Habitacion, 'h')
      .setLock('pessimistic_read')
      .where('h.tipoHabitacionId = :tipo', { tipo: datos.tipoHabitacionId })
      .andWhere('h.empresaId = :empresaId', { empresaId })
      .getMany();

    if (habitaciones.length === 0) {
      throw new BadRequestException(
        'No hay habitaciones registradas de ese tipo. Revisa la configuración del hotel.',
      );
    }

    const fueraDeServicio = habitaciones.filter(
      (h) =>
        h.estado === EstadoHabitacion.MANTENIMIENTO ||
        h.estado === EstadoHabitacion.BLOQUEADA,
    ).length;

    const capacidadUtil = habitaciones.length - fueraDeServicio;

    const comprometidas = await this.contarComprometidas(
      datos.tipoHabitacionId,
      datos.fechaEntrada,
      datos.fechaSalida,
      empresaId,
      manager,
      datos.excluirReservacionId,
    );

    const disponibles = capacidadUtil - comprometidas;

    if (disponibles > 0) {
      return { disponibles, sobreventa: false };
    }

    /* ── Sin cupo: ¿se permite sobreventa? ── */

    if (!datos.permitirSobreventa) {
      const tipo = await manager.findOne(TipoHabitacion, {
        where: { id: datos.tipoHabitacionId },
      });

      throw new ConflictException(
        `No hay disponibilidad de ${tipo?.nombre ?? 'ese tipo de habitación'} ` +
          `para esas fechas. Capacidad ${capacidadUtil}, ya comprometidas ${comprometidas}` +
          (fueraDeServicio > 0
            ? `, ${fueraDeServicio} fuera de servicio`
            : '') +
          '.',
      );
    }

    // Sobreventa autorizada, pero con tope: 10 % por omisión.
    const porcentaje = datos.porcentajeSobreventa ?? 10;
    const topeSobreventa = Math.floor((capacidadUtil * porcentaje) / 100);
    const excedente = Math.abs(disponibles);

    if (excedente >= topeSobreventa) {
      throw new ConflictException(
        `Se alcanzó el límite de sobreventa (${porcentaje}% sobre ${capacidadUtil} ` +
          `habitaciones = ${topeSobreventa} plazas). Ya hay ${excedente} reservaciones ` +
          `por encima de la capacidad.`,
      );
    }

    this.logger.warn(
      `Sobreventa autorizada: tipo ${datos.tipoHabitacionId}, ` +
        `${excedente + 1} sobre la capacidad de ${capacidadUtil}.`,
    );

    return { disponibles: 0, sobreventa: true };
  }

  /* ══ RACK DE OCUPACIÓN ═══════════════════════════════════════════════════ */

  /**
   * Ocupación día por día en un rango. Alimenta el pronóstico y la decisión de
   * subir o bajar tarifas, que es de lo que vive un hotel.
   */
  async ocupacionPorDia(
    empresaId: string,
    desde: string,
    hasta: string,
    hotelId?: string,
  ) {
    const inicio = new Date(desde);
    const fin = new Date(hasta);

    if (fin < inicio) {
      throw new BadRequestException('El rango de fechas es inválido.');
    }

    const dias =
      Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
    if (dias > 120) {
      throw new BadRequestException('El rango no puede exceder 120 días.');
    }

    const habitaciones = await this.habRepo.find({
      where: { empresaId, ...(hotelId ? { hotelId } : {}) },
    });
    const capacidad = habitaciones.length;

    const reservas = await this.resRepo
      .createQueryBuilder('r')
      .where('r.empresaId = :empresaId', { empresaId })
      .andWhere('r.estado IN (:...estados)', {
        estados: ESTADOS_QUE_COMPROMETEN,
      })
      .andWhere('r.fechaEntrada <= :fin', { fin })
      .andWhere('r.fechaSalida > :inicio', { inicio })
      .getMany();

    const serie: Array<{
      fecha: string;
      ocupadas: number;
      disponibles: number;
      porcentaje: number;
      ingresoEstimado: number;
    }> = [];

    for (let i = 0; i < dias; i++) {
      const dia = new Date(inicio.getTime() + i * 86_400_000);

      const delDia = reservas.filter((r) => {
        const e = new Date(r.fechaEntrada);
        const s = new Date(r.fechaSalida);
        return e <= dia && s > dia;
      });

      const ocupadas = delDia.length;
      const ingreso = delDia.reduce(
        (s, r) => s + Number(r.tarifaNoche ?? 0),
        0,
      );

      serie.push({
        fecha: dia.toISOString().slice(0, 10),
        ocupadas,
        disponibles: Math.max(0, capacidad - ocupadas),
        porcentaje:
          capacidad > 0 ? Math.round((ocupadas / capacidad) * 1000) / 10 : 0,
        ingresoEstimado: Math.round(ingreso * 100) / 100,
      });
    }

    const ocupacionPromedio = serie.length
      ? Math.round(
          (serie.reduce((s, d) => s + d.porcentaje, 0) / serie.length) * 10,
        ) / 10
      : 0;

    // Tarifa media diaria: el indicador estándar de la industria.
    const nochesVendidas = serie.reduce((s, d) => s + d.ocupadas, 0);
    const ingresoTotal = serie.reduce((s, d) => s + d.ingresoEstimado, 0);

    return {
      capacidad,
      ocupacionPromedio,
      nochesVendidas,
      ingresoTotal: Math.round(ingresoTotal * 100) / 100,
      tarifaMediaDiaria:
        nochesVendidas > 0
          ? Math.round((ingresoTotal / nochesVendidas) * 100) / 100
          : 0,
      /** RevPAR: ingreso por habitación disponible, ocupada o no. */
      revpar:
        capacidad > 0 && serie.length > 0
          ? Math.round((ingresoTotal / (capacidad * serie.length)) * 100) / 100
          : 0,
      serie,
    };
  }
}
