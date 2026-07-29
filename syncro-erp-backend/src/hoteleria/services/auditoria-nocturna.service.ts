// hoteleria/services/auditoria-nocturna.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Hotel } from '../entities/hotel.entity';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';
import { Folio, CargoFolio, EstadoFolio, TipoCargo } from '../entities/folio.entity';

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
    @InjectRepository(Reservacion) private readonly resRepo: Repository<Reservacion>,
    @InjectRepository(Folio) private readonly folioRepo: Repository<Folio>,
    @InjectRepository(CargoFolio) private readonly cargoRepo: Repository<CargoFolio>,
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
        this.logger.log(`Auditoría ${hotel.nombre}: ${r.nochesPosteadas} noches, $${r.montoTotal}`);
      } catch (e) {
        this.logger.error(`Auditoría falló en ${hotel.nombre}: ${e instanceof Error ? e.message : e}`);
      }
    }
    this.logger.log('Auditoría nocturna automática terminada.');
  }

  // ── EJECUCIÓN MANUAL (para la demo o corte a petición) ───────────────────
  async ejecutarManual(hotelId: string, empresaId: string): Promise<ResultadoAuditoria> {
    const hotel = await this.hotelRepo.findOne({ where: { id: hotelId, empresaId } });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');
    return this.correrParaHotel(hotelId, empresaId);
  }

  // ── LÓGICA CENTRAL ───────────────────────────────────────────────────────
  private async correrParaHotel(hotelId: string, empresaId: string): Promise<ResultadoAuditoria> {
    const hotel = await this.hotelRepo.findOne({ where: { id: hotelId, empresaId } });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');

    // Reservaciones con huésped dentro (check-in activo)
    const activas = await this.resRepo.find({
      where: { hotelId, empresaId, estado: EstadoReservacion.CHECK_IN },
    });

    const detalle: ResultadoAuditoria['detalle'] = [];
    let nochesPosteadasTotal = 0;
    let montoTotal = 0;

    for (const reserva of activas) {
      // ¿Cuántas noches han transcurrido realmente hasta hoy?
      const nochesTotales = this.noches(reserva.fechaEntrada, reserva.fechaSalida);

      // Noches que ya se cobraron (al check-in se postea la primera tanda;
      // aquí solo agregamos las noches nuevas que falten).
      const yaPosteadas = reserva.nochesPosteadas ?? 0;

      // En una auditoría, se postea UNA noche por corrida (la noche que
      // acaba de cerrar). No superamos el total de noches de la estancia.
      if (yaPosteadas >= nochesTotales) continue;

      const folio = await this.folioRepo.findOne({
        where: { reservacionId: reserva.id, empresaId, estado: EstadoFolio.ABIERTO },
      });
      if (!folio) continue;

      const tarifa = Number(reserva.tarifaNoche);
      if (tarifa <= 0) continue;

      // Postear la renta de la noche
      await this.cargoRepo.save(this.cargoRepo.create({
        empresaId, folioId: folio.id, tipo: TipoCargo.HOSPEDAJE,
        concepto: `Renta de la noche (auditoría) — noche ${yaPosteadas + 1}`,
        cantidad: 1, precioUnitario: tarifa, importe: tarifa,
      }));

      folio.total = Number(folio.total) + tarifa;
      await this.folioRepo.save(folio);

      reserva.nochesPosteadas = yaPosteadas + 1;
      await this.resRepo.save(reserva);

      nochesPosteadasTotal++;
      montoTotal += tarifa;
      detalle.push({ codigo: reserva.codigo ?? reserva.id.slice(0, 8), habitacion: null, monto: tarifa });
    }

    // Avanzar la fecha operativa del hotel un día
    const base = hotel.fechaOperativa ? new Date(hotel.fechaOperativa) : new Date();
    base.setDate(base.getDate() + 1);
    hotel.fechaOperativa = base.toISOString().slice(0, 10);
    hotel.ultimaAuditoria = new Date();
    await this.hotelRepo.save(hotel);

    return {
      hotelId,
      fechaOperativa: hotel.fechaOperativa,
      reservacionesProcesadas: activas.length,
      nochesPosteadas: nochesPosteadasTotal,
      montoTotal: Math.round(montoTotal * 100) / 100,
      detalle,
    };
  }

  // Estado actual de la auditoría de un hotel (para la pantalla)
  async estado(hotelId: string, empresaId: string) {
    const hotel = await this.hotelRepo.findOne({ where: { id: hotelId, empresaId } });
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
