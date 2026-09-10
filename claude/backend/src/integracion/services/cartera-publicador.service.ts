import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ModoCartera, TipoEventoIntegracion } from '../integracion.constants';
import { diaCalendario } from '../../common/utils/fecha-calendario.util';
import { IntegracionModoService } from './integracion-modo.service';
import { IntegracionOutboxService } from './integracion-outbox.service';

/**
 * Lo único que el núcleo del ERP conoce de esta integración.
 *
 * Ventas, crédito y aprobaciones llaman aquí para contar un hecho del negocio.
 * No saben qué hay del otro lado —hoy Apache Fineract, corriendo como servicio
 * aparte— ni les importa: cada llamada sólo escribe una fila en
 * `integracion_eventos`, en la misma transacción del hecho que la originó.
 *
 * Es deliberadamente pequeña y tolerante: si la integración está apagada no
 * hace nada, y si algo falla lo registra pero no propaga la excepción. Una
 * venta no puede romperse porque el outbox tuvo un problema.
 */
@Injectable()
export class CarteraPublicadorService {
  private readonly logger = new Logger(CarteraPublicadorService.name);

  constructor(
    private readonly outbox: IntegracionOutboxService,
    private readonly modos: IntegracionModoService,
  ) {}

  async activoPara(empresaId: string): Promise<boolean> {
    return (await this.modos.modoDe(empresaId)) !== ModoCartera.APAGADO;
  }

  /** Alta del cliente en el registro externo. */
  async clienteAlta(
    empresaId: string,
    clienteId: string,
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.CLIENTE_ALTA,
        entidadId: clienteId,
        claveIdempotencia: `cliente-alta:${clienteId}`,
        carga: { clienteId },
      },
      em,
    );
  }

  /** Línea de crédito autorizada tras el flujo de aprobaciones. */
  async lineaAutorizada(
    empresaId: string,
    clienteId: string,
    limite: number,
    version: number,
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.LINEA_AUTORIZADA,
        entidadId: clienteId,
        // La versión entra en la clave: cada reautorización es un hecho
        // distinto, no una repetición del anterior.
        claveIdempotencia: `linea:${clienteId}:v${version}`,
        carga: { clienteId, limite, version },
      },
      em,
    );
  }

  /** Crédito originado por una venta. */
  async creditoOriginado(
    empresaId: string,
    creditoId: string,
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.CREDITO_ORIGINADO,
        entidadId: creditoId,
        claveIdempotencia: `credito:${creditoId}`,
        carga: { creditoId },
      },
      em,
    );
  }

  /**
   * La venta se anuló y su crédito con ella.
   *
   * Esto no existía: el ERP cancelaba el crédito en su base y el registro
   * externo se quedaba con el préstamo vivo por el importe completo, sin que
   * nadie se enterara. Es la clase de divergencia que sólo aparece meses
   * después, cuando alguien concilia.
   */
  async creditoCancelado(
    empresaId: string,
    datos: { creditoId: string; motivo?: string | null; fecha?: Date | string },
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.CREDITO_CANCELADO,
        entidadId: datos.creditoId,
        claveIdempotencia: `credito-cancelado:${datos.creditoId}`,
        carga: {
          creditoId: datos.creditoId,
          motivo: datos.motivo ?? null,
          fecha: this.dia(datos.fecha),
        },
      },
      em,
    );
  }

  /** Devolución de mercancía que baja el saldo de un crédito vivo. */
  async ajusteDevolucion(
    empresaId: string,
    datos: {
      creditoId: string;
      devolucionId: string;
      monto: number;
      folio?: string | null;
      fecha?: Date | string;
    },
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.AJUSTE_DEVOLUCION,
        entidadId: datos.creditoId,
        claveIdempotencia: `devolucion:${datos.devolucionId}`,
        carga: {
          creditoId: datos.creditoId,
          devolucionId: datos.devolucionId,
          monto: datos.monto,
          folio: datos.folio ?? null,
          fecha: this.dia(datos.fecha),
        },
      },
      em,
    );
  }

  /** Un pago de cobranza se deshizo. */
  async pagoRevertido(
    empresaId: string,
    datos: {
      pagoId: string;
      creditoId: string;
      motivo?: string | null;
      fecha?: Date | string;
    },
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.PAGO_REVERTIDO,
        entidadId: datos.pagoId,
        claveIdempotencia: `pago-revertido:${datos.pagoId}`,
        carga: {
          pagoId: datos.pagoId,
          creditoId: datos.creditoId,
          motivo: datos.motivo ?? null,
          fecha: this.dia(datos.fecha),
        },
      },
      em,
    );
  }

  private dia(valor?: Date | string): string {
    return diaCalendario(valor ?? new Date());
  }

  /** Pago de cobranza aplicado en el ERP. */
  async pagoRegistrado(
    empresaId: string,
    datos: {
      pagoId: string;
      creditoId: string;
      monto: number;
      fechaPago: Date | string;
      referencia?: string | null;
    },
    em?: EntityManager,
  ): Promise<void> {
    await this.emitir(
      empresaId,
      {
        tipo: TipoEventoIntegracion.PAGO_REGISTRADO,
        entidadId: datos.pagoId,
        claveIdempotencia: `pago:${datos.pagoId}`,
        carga: {
          pagoId: datos.pagoId,
          creditoId: datos.creditoId,
          monto: datos.monto,
          fechaPago:
            datos.fechaPago instanceof Date
              ? datos.fechaPago.toISOString().slice(0, 10)
              : datos.fechaPago,
          referencia: datos.referencia ?? null,
        },
      },
      em,
    );
  }

  private async emitir(
    empresaId: string,
    evento: {
      tipo: TipoEventoIntegracion;
      entidadId: string;
      claveIdempotencia: string;
      carga: Record<string, unknown>;
    },
    em?: EntityManager,
  ): Promise<void> {
    try {
      if (!(await this.activoPara(empresaId))) return;
      await this.outbox.publicar({ empresaId, ...evento }, em);
    } catch (error) {
      this.logger.error(
        `No se pudo encolar ${evento.tipo} de ${evento.entidadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
