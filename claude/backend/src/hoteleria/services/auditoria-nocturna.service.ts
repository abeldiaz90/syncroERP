import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { fechaCalendarioNegocio } from '../../common/utils/business-time.util';
import { Hotel } from '../entities/hotel.entity';
import { Reservacion, EstadoReservacion } from '../entities/reservacion.entity';
import {
  CargoFolio,
  EstadoContableFolio,
  EstadoFolio,
  Folio,
  TipoCargo,
} from '../entities/folio.entity';
import { omitirTareaProgramada } from '../../common/utils/tareas-programadas.util';

export interface ResultadoAuditoria {
  hotelId: string;
  fechaOperativa: string | null;
  reservacionesProcesadas: number;
  nochesPosteadas: number;
  montoTotal: number;
  detalle: { codigo: string; habitacion: string | null; monto: number }[];
}

const money = (v: number | string | null | undefined) =>
  Math.round(Number(v ?? 0) * 100) / 100;

@Injectable()
export class AuditoriaNocturnaService {
  private readonly logger = new Logger(AuditoriaNocturnaService.name);

  constructor(
    @InjectRepository(Hotel) private readonly hotelRepo: Repository<Hotel>,
    @InjectRepository(Reservacion)
    private readonly resRepo: Repository<Reservacion>,
    private readonly dataSource: DataSource,
  ) {}

  private noches(entrada: string, salida: string): number {
    const inicio = Date.parse(`${entrada.slice(0, 10)}T00:00:00Z`);
    const fin = Date.parse(`${salida.slice(0, 10)}T00:00:00Z`);
    return Math.max(1, Math.round((fin - inicio) / 86_400_000));
  }

  private desglosar(tarifa: number, hotel: Hotel) {
    const totalEntrada = money(tarifa);
    const ivaRate = Number(hotel.tasaIva ?? 0) / 100;
    const ishRate = Number(hotel.tasaImpuestoHospedaje ?? 0) / 100;
    let subtotal = hotel.preciosIncluyenImpuestos
      ? money(totalEntrada / (1 + ivaRate + ishRate))
      : totalEntrada;
    const iva = money(subtotal * ivaRate);
    const impuestoHospedaje = money(subtotal * ishRate);
    const total = hotel.preciosIncluyenImpuestos
      ? totalEntrada
      : money(subtotal + iva + impuestoHospedaje);
    subtotal = money(
      subtotal +
        (Math.round(total * 100) -
          Math.round(subtotal * 100) -
          Math.round(iva * 100) -
          Math.round(impuestoHospedaje * 100)) /
          100,
    );
    return { subtotal, iva, impuestoHospedaje, total };
  }

  // Se evalúa cada hora porque cada propiedad puede tener una zona horaria
  // distinta. Sólo corre cuando en el hotel son las 03:00.
  @Cron('0 * * * *', { name: 'auditoria-nocturna-hotelera' })
  async ejecutarAuditoriaAutomatica() {
    /*
     * El más delicado de los cinco: duplicar esta corrida duplica los cargos
     * automaticos de renta en los folios abiertos.
     */
    if (omitirTareaProgramada('auditoria-nocturna-hotelera')) return;

    const hoteles = await this.hotelRepo.find({ where: { activo: true } });
    for (const hotel of hoteles) {
      const horaLocal = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: hotel.zonaHoraria,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
      );
      if (horaLocal !== 3) continue;
      try {
        let resultado = await this.correrParaHotel(hotel.id, hotel.empresaId);
        const hoyHotel = fechaCalendarioNegocio(new Date(), hotel.zonaHoraria);
        // Recupera días atrasados después de una caída, con un límite defensivo.
        for (
          let intento = 1;
          intento < 31 &&
          resultado.fechaOperativa &&
          resultado.fechaOperativa <= hoyHotel;
          intento++
        ) {
          resultado = await this.correrParaHotel(hotel.id, hotel.empresaId);
        }
        this.logger.log(
          `Auditoría ${hotel.nombre}: ${resultado.nochesPosteadas} noches, $${resultado.montoTotal}.`,
        );
      } catch (error) {
        this.logger.error(
          `Auditoría falló en ${hotel.nombre}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async ejecutarManual(hotelId: string, empresaId: string) {
    return this.correrParaHotel(hotelId, empresaId);
  }

  private async correrParaHotel(
    hotelId: string,
    empresaId: string,
  ): Promise<ResultadoAuditoria> {
    const detalle: ResultadoAuditoria['detalle'] = [];
    let nochesPosteadas = 0;
    let montoTotal = 0;
    let reservacionesProcesadas = 0;
    let fechaOperativa: string | null = null;

    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const hotel = await manager
        .getRepository(Hotel)
        .createQueryBuilder('h')
        .setLock('pessimistic_write')
        .where('h.id=:hotelId AND h.empresaId=:empresaId', {
          hotelId,
          empresaId,
        })
        .getOne();
      if (!hotel) throw new NotFoundException('Hotel no encontrado.');

      const hoyHotel = fechaCalendarioNegocio(new Date(), hotel.zonaHoraria);
      if (!hotel.fechaOperativa) hotel.fechaOperativa = hoyHotel;
      // `fechaOperativa` es la autoridad. Usar únicamente la fecha de la última
      // ejecución impedía recuperar días atrasados durante el mismo día.
      if (hotel.fechaOperativa > hoyHotel) {
        fechaOperativa = hotel.fechaOperativa;
        return;
      }

      const inconsistencia = await manager.query(
        `SELECT f.id, f.estado, f.estadoContable, f.saldoPendiente
           FROM folios f
           INNER JOIN reservaciones r ON r.id=f.reservacionId AND r.empresaId=f.empresaId
          WHERE f.empresaId=$1 AND r.hotelId=$2
            AND ((f.estado='CERRADO' AND (f.estadoContable<>'GENERADO' OR ABS(f.saldoPendiente)>0.009))
              OR (f.estado='PENDIENTE_PAGO'))
          LIMIT 1`,
        [empresaId, hotelId],
      );
      if (inconsistencia.length) {
        throw new BadRequestException(
          'No se puede avanzar la fecha operativa: existen folios cerrados sin contabilizar, con saldo o pendientes de pago.',
        );
      }

      const activas = await manager.getRepository(Reservacion).find({
        where: { hotelId, empresaId, estado: EstadoReservacion.CHECK_IN },
        order: { id: 'ASC' },
      });
      reservacionesProcesadas = activas.length;

      for (const reserva of activas) {
        const totalNoches = this.noches(
          reserva.fechaEntrada,
          reserva.fechaSalida,
        );
        const yaPosteadas = reserva.nochesPosteadas ?? 0;
        if (yaPosteadas >= totalNoches) continue;
        const folio = await manager.getRepository(Folio).findOne({
          where: {
            reservacionId: reserva.id,
            empresaId,
            estado: EstadoFolio.ABIERTO,
          },
        });
        if (!folio) {
          throw new BadRequestException(
            `La reservación ${reserva.codigo} está hospedada sin folio abierto.`,
          );
        }
        const tarifa = Number(reserva.tarifaNoche);
        if (tarifa <= 0) {
          throw new BadRequestException(
            `La reservación ${reserva.codigo} tiene tarifa cero.`,
          );
        }
        const clave = `HOSPEDAJE:${reserva.id}:NOCHE:${yaPosteadas + 1}`;
        const existente = await manager.getRepository(CargoFolio).findOne({
          where: { empresaId, claveIdempotencia: clave },
        });
        if (existente) {
          reserva.nochesPosteadas = Math.max(yaPosteadas, yaPosteadas + 1);
          await manager.getRepository(Reservacion).save(reserva);
          continue;
        }
        const desglose = this.desglosar(tarifa, hotel);
        await manager.getRepository(CargoFolio).save(
          manager.getRepository(CargoFolio).create({
            empresaId,
            folioId: folio.id,
            tipo: TipoCargo.HOSPEDAJE,
            concepto: `Hospedaje — noche ${yaPosteadas + 1} de ${totalNoches}`,
            cantidad: 1,
            precioUnitario: tarifa,
            subtotal: desglose.subtotal,
            iva: desglose.iva,
            impuestoHospedaje: desglose.impuestoHospedaje,
            importe: desglose.total,
            tasaIva: Number(hotel.tasaIva),
            tasaImpuestoHospedaje: Number(hotel.tasaImpuestoHospedaje),
            centroIngreso: 'HABITACIONES',
            claveIdempotencia: clave,
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
        reserva.nochesPosteadas = yaPosteadas + 1;
        await manager.getRepository(Reservacion).save(reserva);
        nochesPosteadas += 1;
        montoTotal = money(montoTotal + desglose.total);
        detalle.push({
          codigo: reserva.codigo ?? reserva.id.slice(0, 8),
          habitacion: null,
          monto: desglose.total,
        });
      }

      const actual = hotel.fechaOperativa ?? hoyHotel;
      const [year, month, day] = actual.split('-').map(Number);
      hotel.fechaOperativa = new Date(Date.UTC(year, month - 1, day + 1))
        .toISOString()
        .slice(0, 10);
      hotel.ultimaAuditoria = new Date();
      await manager.getRepository(Hotel).save(hotel);
      fechaOperativa = hotel.fechaOperativa;
    });

    return {
      hotelId,
      fechaOperativa,
      reservacionesProcesadas,
      nochesPosteadas,
      montoTotal,
      detalle,
    };
  }

  async estado(hotelId: string, empresaId: string) {
    const hotel = await this.hotelRepo.findOne({
      where: { id: hotelId, empresaId },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado.');
    const hospedados = await this.resRepo.count({
      where: { hotelId, empresaId, estado: EstadoReservacion.CHECK_IN },
    });
    const pendientes = await this.dataSource.query(
      `SELECT COUNT(*) total
         FROM folios f
         INNER JOIN reservaciones r ON r.id=f.reservacionId AND r.empresaId=f.empresaId
        WHERE f.empresaId=$1 AND r.hotelId=$2
          AND f.estado='CERRADO' AND f.estadoContable<>'GENERADO'`,
      [empresaId, hotelId],
    );
    return {
      fechaOperativa:
        hotel.fechaOperativa ??
        fechaCalendarioNegocio(new Date(), hotel.zonaHoraria),
      zonaHoraria: hotel.zonaHoraria,
      ultimaAuditoria: hotel.ultimaAuditoria,
      huespedesHospedados: hospedados,
      foliosContablesPendientes: Number(pendientes?.[0]?.total ?? 0),
    };
  }
}
