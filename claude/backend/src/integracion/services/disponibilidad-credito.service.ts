import { Inject, Injectable, Logger } from '@nestjs/common';
import { PoliticaCreditoService } from '../../common/services/politica-credito.service';
import {
  ModoCartera,
  OrigenDisponibilidad,
  PUERTO_CARTERA_EXTERNA,
  TipoVinculo,
} from '../integracion.constants';
import { PuertoCarteraExterna } from '../ports/cartera-externa.port';
import { IntegracionModoService } from './integracion-modo.service';
import { IntegracionVinculosService } from './integracion-vinculos.service';

export interface DisponibilidadCredito {
  clienteId: string;
  limite: number;
  utilizado: number;
  disponible: number;
  vencido: number;
  puedeOperar: boolean;
  razonBloqueo: string | null;
  origen: OrigenDisponibilidad;
  /** Verdadero cuando la respuesta salió de caché por no haber podido consultar. */
  degradado: boolean;
  consultadoEn: Date;
}

interface EntradaCache {
  valor: DisponibilidadCredito;
  guardadoEn: number;
}

/** Cuánto tiempo se considera fresca una respuesta del registro externo. */
const TTL_FRESCO_MS = 30_000;
/** Cuánto tiempo se acepta servir una respuesta vieja si no responde. */
const TTL_DEGRADADO_MS = 30 * 60_000;

/**
 * Única puerta por la que el punto de venta pregunta si un cliente puede
 * comprar a crédito.
 *
 * La regla de diseño es que la caja nunca se detiene por una falla de
 * infraestructura, pero tampoco autoriza a ciegas: la respuesta siempre dice de
 * dónde salió, y una venta autorizada con caché degradado queda marcada para
 * que la conciliación la revise.
 *
 * En modo SOMBRA la decisión la sigue tomando el ERP aunque el registro externo
 * responda: lo que se hace es comparar y registrar la diferencia. Sólo en
 * AUTORIDAD manda el registro externo.
 */
@Injectable()
export class DisponibilidadCreditoService {
  private readonly logger = new Logger(DisponibilidadCreditoService.name);
  private readonly cache = new Map<string, EntradaCache>();

  constructor(
    private readonly politica: PoliticaCreditoService,
    private readonly modos: IntegracionModoService,
    private readonly vinculos: IntegracionVinculosService,
    @Inject(PUERTO_CARTERA_EXTERNA)
    private readonly externa: PuertoCarteraExterna,
  ) {}

  async consultar(
    empresaId: string,
    clienteId: string,
  ): Promise<DisponibilidadCredito> {
    const modo = await this.modos.modoDe(empresaId);
    const local = await this.desdeErp(empresaId, clienteId);

    if (modo === ModoCartera.APAGADO) return local;

    const remoto = await this.desdeRegistroExterno(
      empresaId,
      clienteId,
      local.limite,
    );

    if (modo === ModoCartera.SOMBRA) {
      if (remoto) this.registrarDivergencia(empresaId, clienteId, local, remoto);
      return local;
    }

    // AUTORIDAD
    if (remoto) {
      this.guardarEnCache(empresaId, clienteId, remoto);
      return remoto;
    }

    const cacheado = this.leerCache(empresaId, clienteId, TTL_DEGRADADO_MS);
    if (cacheado) {
      this.logger.warn(
        `El registro externo no respondió; ${clienteId} se resuelve con caché degradado.`,
      );
      return {
        ...cacheado,
        degradado: true,
        origen: OrigenDisponibilidad.CACHE_DEGRADADO,
      };
    }

    // Sin registro externo y sin caché, el ERP es el último recurso conocido.
    // Es preferible a negar la venta: el ERP tiene el dato de ayer, no ninguno.
    this.logger.warn(
      `El registro externo no respondió y no hay caché para ${clienteId}; se usa el saldo del ERP.`,
    );
    return { ...local, degradado: true };
  }

  /** Estado del enlace, para la pantalla de administración. */
  estado() {
    return {
      ...this.externa.estado(),
      entradasEnCache: this.cache.size,
    };
  }

  /** Invalida el caché de un cliente tras una venta o un pago. */
  invalidar(empresaId: string, clienteId: string): void {
    this.cache.delete(this.clave(empresaId, clienteId));
  }

  private async desdeErp(
    empresaId: string,
    clienteId: string,
  ): Promise<DisponibilidadCredito> {
    const resumen = await this.politica.obtenerResumen(empresaId, clienteId);
    return {
      clienteId,
      limite: resumen.limite,
      utilizado: resumen.utilizado,
      disponible: resumen.disponible,
      vencido: resumen.vencido,
      puedeOperar: resumen.puedeOperar,
      razonBloqueo: resumen.razonBloqueo,
      origen: OrigenDisponibilidad.ERP,
      degradado: false,
      consultadoEn: new Date(),
    };
  }

  private async desdeRegistroExterno(
    empresaId: string,
    clienteId: string,
    limite: number,
  ): Promise<DisponibilidadCredito | null> {
    if (!this.externa.disponible()) return null;

    const fresco = this.leerCache(empresaId, clienteId, TTL_FRESCO_MS);
    if (fresco) return fresco;

    const idExterno = await this.vinculos.idExterno(
      empresaId,
      TipoVinculo.CLIENTE,
      clienteId,
    );
    if (!idExterno) return null;

    try {
      const resumen = await this.externa.resumenCliente(idExterno);
      const disponible = Math.max(0, limite - resumen.saldoTotal);
      const bloqueado = resumen.saldoVencido > 0;

      return {
        clienteId,
        limite,
        utilizado: resumen.saldoTotal,
        disponible,
        vencido: resumen.saldoVencido,
        puedeOperar: !bloqueado && disponible > 0,
        razonBloqueo: bloqueado
          ? `El cliente tiene ${resumen.saldoVencido.toFixed(2)} vencidos (${resumen.diasAtrasoMaximo} días de atraso).`
          : disponible > 0
            ? null
            : 'La línea de crédito está agotada.',
        origen: OrigenDisponibilidad.EXTERNO,
        degradado: false,
        consultadoEn: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `El registro externo no resolvió la disponibilidad de ${clienteId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private registrarDivergencia(
    empresaId: string,
    clienteId: string,
    erp: DisponibilidadCredito,
    externo: DisponibilidadCredito,
  ): void {
    const diferencia = Math.abs(erp.utilizado - externo.utilizado);
    if (diferencia <= 1) return;
    this.logger.warn(
      `[SOMBRA] ${empresaId}/${clienteId}: utilizado ERP ${erp.utilizado} vs externo ${externo.utilizado} (dif. ${diferencia.toFixed(2)}).`,
    );
  }

  private clave(empresaId: string, clienteId: string) {
    return `${empresaId}:${clienteId}`;
  }

  private guardarEnCache(
    empresaId: string,
    clienteId: string,
    valor: DisponibilidadCredito,
  ): void {
    this.cache.set(this.clave(empresaId, clienteId), {
      valor,
      guardadoEn: Date.now(),
    });
  }

  private leerCache(
    empresaId: string,
    clienteId: string,
    ventanaMs: number,
  ): DisponibilidadCredito | null {
    const entrada = this.cache.get(this.clave(empresaId, clienteId));
    if (!entrada) return null;
    if (Date.now() - entrada.guardadoEn > ventanaMs) return null;
    return entrada.valor;
  }
}
