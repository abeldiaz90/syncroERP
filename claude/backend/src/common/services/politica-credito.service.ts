import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { fechaCalendarioNegocio } from '../utils/business-time.util';

const dinero = (valor: unknown) =>
  Math.round(Number(valor ?? 0) * 100) / 100;

export interface ResumenLineaCredito {
  cliente: Cliente;
  clienteId: string;
  limite: number;
  diasCredito: number;
  versionCredito: number;
  bloquearConSaldoVencido: boolean;
  saldoVentas: number;
  saldoHotel: number;
  utilizado: number;
  disponible: number;
  vencidoVentas: number;
  vencidoHotel: number;
  vencido: number;
  puedeOperar: boolean;
  razonBloqueo: string | null;
}

export interface ValidarOperacionCreditoInput {
  empresaId: string;
  clienteId: string;
  importe: number;
  fechaVencimiento?: Date | string;
  fechaCorte?: string;
}

/**
 * Fuente única de verdad para la exposición crediticia del cliente.
 *
 * Suma ventas a crédito y City Ledger y, cuando se usa dentro de una
 * transacción, toma el mismo sp_getapplock para ambos canales. Así una venta y
 * un check-out concurrentes no pueden consumir dos veces el último disponible.
 */
@Injectable()
export class PoliticaCreditoService {
  constructor(private readonly dataSource: DataSource) {}

  private administrador(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async reservarLineaEnTransaccion(
    manager: EntityManager,
    empresaId: string,
    clienteId: string,
  ) {
    const filas = await manager.query(
      `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
      [`LINEA_CREDITO:${empresaId}:${clienteId}`],
    );
    if (Number(filas?.[0]?.resultado ?? -999) < 0) {
      throw new ConflictException(
        'No fue posible reservar la línea de crédito del cliente. Intenta nuevamente.',
      );
    }
  }

  async obtenerResumen(
    empresaId: string,
    clienteId: string,
    opciones: {
      manager?: EntityManager;
      bloquear?: boolean;
      fechaCorte?: string;
    } = {},
  ): Promise<ResumenLineaCredito> {
    const manager = this.administrador(opciones.manager);
    const consultaCliente = manager
      .getRepository(Cliente)
      .createQueryBuilder('cliente')
      .where('cliente.id=:clienteId AND cliente.empresaId=:empresaId', {
        clienteId,
        empresaId,
      });
    if (opciones.bloquear) consultaCliente.setLock('pessimistic_write');
    const cliente = await consultaCliente.getOne();
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    const fechaCorte =
      opciones.fechaCorte?.slice(0, 10) ?? fechaCalendarioNegocio(new Date());
    /*
     * Los alias van ENTRECOMILLADOS. Postgres pliega a minúsculas cualquier
     * identificador sin comillas, así que `... saldoVentas` regresaba la
     * propiedad `saldoventas` y el código, que la leía como `saldoVentas`,
     * recibía `undefined` — que `dinero()` convierte en cero sin quejarse.
     *
     * El efecto era que la línea de crédito NUNCA se consumía: utilizado
     * siempre cero, disponible siempre el límite completo, vencido siempre
     * cero. Un cliente podía rebasar su línea indefinidamente y uno con mora
     * jamás quedaba bloqueado. Compilaba, corría y devolvía números creíbles.
     */
    const [fila] = await manager.query<
      {
        saldoVentas: string;
        saldoHotel: string;
        vencidoVentas: string;
        vencidoHotel: string;
      }[]
    >(
      `SELECT
         COALESCE((SELECT SUM(c.saldoPendiente)
           FROM creditos_clientes c
          WHERE c.empresaId=$1 AND c.clienteId=$2
            AND c.estado IN ('ACTIVO','VENCIDO')),0) AS "saldoVentas",
         COALESCE((SELECT SUM(h.saldoPendiente)
           FROM hoteleria_city_ledger_cuentas h
          WHERE h.empresaId=$1 AND h.clienteId=$2
            AND h.estado IN ('ABIERTA','VENCIDA')),0) AS "saldoHotel",
         COALESCE((SELECT SUM(
             CASE WHEN q.montoCuota-q.montoPagado > 0
                  THEN q.montoCuota-q.montoPagado ELSE 0 END)
           FROM amortizacion_cuotas q
           INNER JOIN creditos_clientes c ON c.id=q.creditoId
          WHERE c.empresaId=$1 AND c.clienteId=$2
            AND q.fechaVencimiento < $3
            AND q.estado IN ('PENDIENTE','PAGO_PARCIAL','VENCIDA')),0) AS "vencidoVentas",
         COALESCE((SELECT SUM(h.saldoPendiente)
           FROM hoteleria_city_ledger_cuentas h
          WHERE h.empresaId=$1 AND h.clienteId=$2
            AND h.fechaVencimiento < $3
            AND h.saldoPendiente > 0
            AND h.estado IN ('ABIERTA','VENCIDA')),0) AS "vencidoHotel"`,
      [empresaId, clienteId, fechaCorte],
    );

    const limite = dinero(cliente.limiteCredito);
    const saldoVentas = dinero(fila?.saldoVentas);
    const saldoHotel = dinero(fila?.saldoHotel);
    const utilizado = dinero(saldoVentas + saldoHotel);
    const vencidoVentas = dinero(fila?.vencidoVentas);
    const vencidoHotel = dinero(fila?.vencidoHotel);
    const vencido = dinero(vencidoVentas + vencidoHotel);
    const diasCredito = Number(cliente.diasCredito ?? 0);
    let razonBloqueo: string | null = null;
    if (!cliente.activo) razonBloqueo = 'El cliente está inactivo.';
    else if (cliente.estadoCredito !== 'AUTORIZADO') {
      razonBloqueo = `La línea de crédito está en estado ${cliente.estadoCredito}.`;
    } else if (limite <= 0 || diasCredito <= 0) {
      razonBloqueo = 'El cliente no tiene límite y plazo autorizados.';
    } else if (cliente.bloquearCreditoConSaldoVencido !== false && vencido > 0) {
      razonBloqueo = 'El cliente tiene saldos vencidos en su exposición global.';
    }

    return {
      cliente,
      clienteId,
      limite,
      diasCredito,
      versionCredito: Number(cliente.versionCredito ?? 1),
      bloquearConSaldoVencido:
        cliente.bloquearCreditoConSaldoVencido !== false,
      saldoVentas,
      saldoHotel,
      utilizado,
      disponible: Math.max(0, dinero(limite - utilizado)),
      vencidoVentas,
      vencidoHotel,
      vencido,
      puedeOperar: razonBloqueo === null,
      razonBloqueo,
    };
  }

  async validarOperacionEnTransaccion(
    manager: EntityManager,
    input: ValidarOperacionCreditoInput,
  ): Promise<ResumenLineaCredito> {
    const importe = dinero(input.importe);
    if (!Number.isFinite(importe) || importe <= 0) {
      throw new BadRequestException(
        'El importe que consumirá la línea debe ser mayor a cero.',
      );
    }

    await this.reservarLineaEnTransaccion(
      manager,
      input.empresaId,
      input.clienteId,
    );
    const resumen = await this.obtenerResumen(input.empresaId, input.clienteId, {
      manager,
      bloquear: true,
      fechaCorte: input.fechaCorte,
    });

    if (!resumen.cliente.activo) {
      throw new ConflictException('El cliente está inactivo.');
    }
    if (resumen.cliente.estadoCredito !== 'AUTORIZADO') {
      throw new ConflictException(
        `La línea de crédito no está autorizada (estado: ${resumen.cliente.estadoCredito}).`,
      );
    }
    if (resumen.limite <= 0 || resumen.diasCredito <= 0) {
      throw new ConflictException(
        'El cliente no tiene un límite y plazo de crédito autorizados.',
      );
    }
    // La política se hereda exclusivamente de la línea maestra del cliente.
    // El parámetro legado se conserva en la interfaz para compatibilidad, pero
    // ningún canal puede relajarla por su cuenta.
    if (resumen.bloquearConSaldoVencido && resumen.vencido > 0) {
      throw new ConflictException(
        `El cliente tiene ${resumen.vencido.toFixed(2)} vencidos en su exposición global.`,
      );
    }
    if (dinero(resumen.utilizado + importe) - resumen.limite > 0.009) {
      throw new ConflictException(
        `Crédito global insuficiente. Disponible: ${resumen.disponible.toFixed(2)}; solicitado: ${importe.toFixed(2)}.`,
      );
    }

    if (input.fechaVencimiento) {
      const fechaVencimiento =
        input.fechaVencimiento instanceof Date
          ? input.fechaVencimiento
          : new Date(`${input.fechaVencimiento.slice(0, 10)}T12:00:00`);
      if (Number.isNaN(fechaVencimiento.getTime())) {
        throw new BadRequestException('La fecha de vencimiento no es válida.');
      }
      const fechaBase = input.fechaCorte
        ? new Date(`${input.fechaCorte.slice(0, 10)}T12:00:00`)
        : new Date();
      const maxima = new Date(fechaBase);
      maxima.setDate(maxima.getDate() + resumen.diasCredito);
      if (fechaVencimiento.getTime() > maxima.getTime()) {
        throw new ConflictException(
          `El vencimiento excede los ${resumen.diasCredito} días autorizados al cliente.`,
        );
      }
    }

    return resumen;
  }
}
