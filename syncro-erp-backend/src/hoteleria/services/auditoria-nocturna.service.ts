// hoteleria/services/auditoria-nocturna.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Hotel } from '../entities/hotel.entity';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';
import {
  Folio,
  CargoFolio,
  EstadoFolio,
  TipoCargo,
} from '../entities/folio.entity';

// Resultado de una corrida de auditoría
export interface ResultadoAuditoria {
  hotelId: string;
  fechaOperativa: string | null;
  reservacionesProcesadas: number;
  nochesPosteadas: number;
  montoTotal: number;
  detalle: { codigo: string; habitacion: string | null; monto: number }[];
}

@Injectable()
export class AuditoriaNocturnaService {
  private readonly logger = new Logger(AuditoriaNocturnaService.name);

  constructor(
    @InjectRepository(Hotel) private readonly hotelRepo: Repository<Hotel>,
    @InjectRepository(Reservacion)
    private readonly resRepo: Repository<Reservacion>,
    @InjectRepository(Folio) private readonly folioRepo: Repository<Folio>,
    @InjectRepository(CargoFolio)
    private readonly cargoRepo: Repository<CargoFolio>,
    private readonly dataSource: DataSource,
  ) {}

  private noches(entrada: string, salida: string): number {
    const ms = new Date(salida).getTime() - new Date(entrada).getTime();
    const n = Math.round(ms / (1000 * 60 * 60 * 24));
    return n > 0 ? n : 1;
  }

  private hoyISO(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ── CRON: corre todos los días a las 3:00 AM ─────────────────────────────
  // El PMS "cierra el día": postea la renta de la noche a cada huésped
  // hospedado y avanza la fecha operativa de cada hotel.
  @Cron('0 3 * * *', { name: 'auditoria-nocturna-hotelera' })
  async ejecutarAuditoriaAutomatica() {
    this.logger.log('Iniciando auditoría nocturna automática…');
    const hoteles = await this.hotelRepo.find({ where: { activo: true } });
    for (const hotel of hoteles) {
      try {
        const r = await this.correrParaHotel(hotel.id, hotel.empresaId);
        this.logger.log(
          `Auditoría ${hotel.nombre}: ${r.nochesPosteadas} noches, $${r.montoTotal}`,
        );
      } catch (e) {
        this.logger.error(
          `Auditoría falló en ${hotel.nombre}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    this.logger.log('Auditoría nocturna automática terminada.');
  }

  // ── EJECUCIÓN MANUAL (para la demo o corte a petición) ───────────────────
  async ejecutarManual(
    hotelId: string,
    empresaId: string,
  ): Promise<ResultadoAuditoria> {
    const hotel = await this.hotelRepo.findOne({
      where: { id: hotelId, empresaId },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');
    return this.correrParaHotel(hotelId, empresaId);
  }

  // ── LÓGICA CENTRAL ───────────────────────────────────────────────────────
  private async correrParaHotel(
    hotelId: string,
    empresaId: string,
  ): Promise<ResultadoAuditoria> {
    const detalle: ResultadoAuditoria['detalle'] = [];
    let nochesPosteadasTotal = 0;
    let montoTotal = 0;
    let fechaOperativa: string | null = null;
    let reservacionesProcesadas = 0;

    await this.dataSource.transaction(async (manager) => {
      // Serializa el cron y la ejecución manual, incluso con varias instancias.
      const hotel = await manager
        .getRepository(Hotel)
        .createQueryBuilder('h')
        .setLock('pessimistic_write')
        .where('h.id = :hotelId AND h.empresaId = :empresaId', {
          hotelId,
          empresaId,
        })
        .getOne();
      if (!hotel) throw new NotFoundException('Hotel no encontrado');

      const hoy = this.hoyISO();
      if (
        hotel.ultimaAuditoria &&
        hotel.ultimaAuditoria.toISOString().slice(0, 10) === hoy
      ) {
        fechaOperativa = hotel.fechaOperativa;
        return;
      }

      const activas = await manager.getRepository(Reservacion).find({
        where: { hotelId, empresaId, estado: EstadoReservacion.CHECK_IN },
      });
      reservacionesProcesadas = activas.length;

      for (const reserva of activas) {
        // ¿Cuántas noches han transcurrido realmente hasta hoy?
        const nochesTotales = this.noches(
          reserva.fechaEntrada,
          reserva.fechaSalida,
        );

        // Noches que ya se cobraron (al check-in se postea la primera tanda;
        // aquí solo agregamos las noches nuevas que falten).
        const yaPosteadas = reserva.nochesPosteadas ?? 0;

        // En una auditoría, se postea UNA noche por corrida (la noche que
        // acaba de cerrar). No superamos el total de noches de la estancia.
        if (yaPosteadas >= nochesTotales) continue;

        const folio = await manager.getRepository(Folio).findOne({
          where: {
            reservacionId: reserva.id,
            empresaId,
            estado: EstadoFolio.ABIERTO,
          },
        });
        if (!folio) continue;

        const tarifa = Number(reserva.tarifaNoche);
        if (tarifa <= 0) continue;

        // Postear la renta de la noche
        const claveIdempotencia = `AUDITORIA:${hotelId}:${reserva.id}:NOCHE:${yaPosteadas + 1}`;
        const existente = await manager.getRepository(CargoFolio).findOne({
          where: { empresaId, claveIdempotencia },
        });
        if (existente) continue;

        await manager.getRepository(CargoFolio).save(
          manager.getRepository(CargoFolio).create({
            empresaId,
            folioId: folio.id,
            tipo: TipoCargo.HOSPEDAJE,
            concepto: `Renta de la noche (auditoría) — noche ${yaPosteadas + 1}`,
            cantidad: 1,
            precioUnitario: tarifa,
            importe: tarifa,
            claveIdempotencia,
          }),
        );

        folio.total = Number(folio.total) + tarifa;
        await manager.getRepository(Folio).save(folio);

        reserva.nochesPosteadas = yaPosteadas + 1;
        await manager.getRepository(Reservacion).save(reserva);

        nochesPosteadasTotal++;
        montoTotal += tarifa;
        detalle.push({
          codigo: reserva.codigo ?? reserva.id.slice(0, 8),
          habitacion: null,
          monto: tarifa,
        });
      }

      // Avanzar la fecha operativa sólo dentro de la misma transacción.
      const base = hotel.fechaOperativa
        ? new Date(`${hotel.fechaOperativa}T12:00:00`)
        : new Date();
      base.setDate(base.getDate() + 1);
      hotel.fechaOperativa = base.toISOString().slice(0, 10);
      hotel.ultimaAuditoria = new Date();
      await manager.getRepository(Hotel).save(hotel);
      fechaOperativa = hotel.fechaOperativa;
    });

    return {
      hotelId,
      fechaOperativa,
      reservacionesProcesadas,
      nochesPosteadas: nochesPosteadasTotal,
      montoTotal: Math.round(montoTotal * 100) / 100,
      detalle,
    };
  }

  // Estado actual de la auditoría de un hotel (para la pantalla)
  async estado(hotelId: string, empresaId: string) {
    const hotel = await this.hotelRepo.findOne({
      where: { id: hotelId, empresaId },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');
    const activas = await this.resRepo.count({
      where: { hotelId, empresaId, estado: EstadoReservacion.CHECK_IN },
    });
    return {
      fechaOperativa: hotel.fechaOperativa ?? this.hoyISO(),
      ultimaAuditoria: hotel.ultimaAuditoria,
      huespedesHospedados: activas,
    };
  }
}
