import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { EventoIntegracion } from '../entities/evento-integracion.entity';
import {
  EstadoEventoIntegracion,
  TipoEventoIntegracion,
} from '../integracion.constants';

export interface PublicarEventoInput {
  empresaId: string;
  tipo: TipoEventoIntegracion;
  entidadId?: string | null;
  /** Debe ser estable para el mismo hecho económico. */
  claveIdempotencia: string;
  carga: Record<string, unknown>;
}

/**
 * Retroceso exponencial con techo. Intencionalmente empieza corto (5 s) —un
 * reinicio del proveedor se recupera solo— y termina en una hora, para que un
 * evento atascado no consuma el despachador.
 */
export function esperaDeReintento(intentos: number): number {
  const base = 5_000 * Math.pow(2, Math.max(0, intentos - 1));
  return Math.min(base, 60 * 60 * 1000);
}

@Injectable()
export class IntegracionOutboxService {
  private readonly logger = new Logger(IntegracionOutboxService.name);

  constructor(
    @InjectRepository(EventoIntegracion)
    private readonly repo: Repository<EventoIntegracion>,
  ) {}

  /**
   * Se llama DENTRO de la transacción de negocio (venta, pago, cancelación).
   * Si la transacción se revierte, el evento desaparece con ella: nunca se
   * publica un hecho que el ERP no consumó.
   */
  async publicar(
    input: PublicarEventoInput,
    em?: EntityManager,
  ): Promise<EventoIntegracion | null> {
    const repo = em ? em.getRepository(EventoIntegracion) : this.repo;

    const yaExiste = await repo.findOne({
      where: {
        empresaId: input.empresaId,
        claveIdempotencia: input.claveIdempotencia,
      },
    });
    if (yaExiste) return yaExiste;

    return repo.save(
      repo.create({
        empresaId: input.empresaId,
        tipo: input.tipo,
        entidadId: input.entidadId ?? null,
        claveIdempotencia: input.claveIdempotencia,
        carga: input.carga,
        estado: EstadoEventoIntegracion.PENDIENTE,
        intentos: 0,
        proximoIntento: new Date(),
      }),
    );
  }

  /** Lote listo para despachar, en orden de creación. */
  async pendientes(limite = 50): Promise<EventoIntegracion[]> {
    return this.repo.find({
      where: [
        {
          estado: EstadoEventoIntegracion.PENDIENTE,
          proximoIntento: LessThanOrEqual(new Date()),
        },
        {
          estado: EstadoEventoIntegracion.REINTENTABLE,
          proximoIntento: LessThanOrEqual(new Date()),
        },
      ],
      order: { fechaCreacion: 'ASC' },
      take: limite,
    });
  }

  async marcarEnviado(
    evento: EventoIntegracion,
    respuesta: Record<string, unknown> | null,
  ): Promise<void> {
    await this.repo.update(evento.id, {
      estado: EstadoEventoIntegracion.ENVIADO,
      respuesta,
      fechaEnvio: new Date(),
      ultimoError: null,
      proximoIntento: null,
    });
  }

  async marcarFallo(
    evento: EventoIntegracion,
    error: string,
    reintentable: boolean,
    maxIntentos: number,
  ): Promise<void> {
    const intentos = evento.intentos + 1;
    const agotado = intentos >= maxIntentos;
    const definitivo = !reintentable || agotado;

    await this.repo.update(evento.id, {
      intentos,
      estado: definitivo
        ? EstadoEventoIntegracion.FALLIDO
        : EstadoEventoIntegracion.REINTENTABLE,
      ultimoError: error.slice(0, 2000),
      proximoIntento: definitivo
        ? null
        : new Date(Date.now() + esperaDeReintento(intentos)),
    });

    if (definitivo) {
      this.logger.error(
        `Evento ${evento.tipo} ${evento.id} quedó FALLIDO tras ${intentos} intento(s): ${error}`,
      );
    }
  }

  /** Devuelve un evento fallido a la cola tras corregir la causa. */
  async reencolar(id: string, empresaId: string): Promise<boolean> {
    const resultado = await this.repo.update(
      { id, empresaId },
      {
        estado: EstadoEventoIntegracion.PENDIENTE,
        intentos: 0,
        proximoIntento: new Date(),
        ultimoError: null,
      },
    );
    return (resultado.affected ?? 0) > 0;
  }

  /**
   * Eventos de una empresa, para la pantalla de operación. El error de cada uno
   * es el dato que importa: un outbox sin forma de leer por qué falló algo es
   * una caja negra.
   */
  async listar(
    empresaId: string,
    filtros: { estado?: EstadoEventoIntegracion; limite?: number } = {},
  ): Promise<EventoIntegracion[]> {
    return this.repo.find({
      where: {
        empresaId,
        ...(filtros.estado ? { estado: filtros.estado } : {}),
      },
      order: { fechaCreacion: 'DESC' },
      take: Math.min(filtros.limite ?? 50, 200),
    });
  }

  async resumen(empresaId: string) {
    const filas = await this.repo
      .createQueryBuilder('e')
      .select('e.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .where('e.empresaId = :empresaId', { empresaId })
      .groupBy('e.estado')
      .getRawMany<{ estado: string; total: string }>();

    return filas.reduce<Record<string, number>>((acc, fila) => {
      acc[fila.estado] = Number(fila.total);
      return acc;
    }, {});
  }
}
