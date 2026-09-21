import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';

/**
 * ============================================================================
 * De qué empresa es la operación que va hacia el core
 * ----------------------------------------------------------------------------
 * En Fineract el inquilino es la frontera de verdad: catálogo de cuentas,
 * mayor, clientes y créditos viven dentro de uno. El aprovisionamiento ya
 * tomaba un inquilino de la reserva y lo guardaba por empresa, y **ninguna
 * llamada de operación lo usaba**: todas iban con `FINERACT_TENANT`, el global.
 * Es decir, la reserva prometía un aislamiento que el sistema no daba.
 *
 * Arreglarlo pasando `empresaId` por cada método del puerto no funciona: la
 * mitad de ellos no lo recibe —`saldoCredito`, `cuentasDisponibles`,
 * `consultarAsiento`— y añadirlo a todos deja el riesgo intacto, porque basta
 * olvidarlo en uno para escribir en el inquilino equivocado, y eso no da error:
 * escribe en el lugar de otro cliente.
 *
 * Por eso el contexto viaja **por fuera**, con `AsyncLocalStorage`: se abre una
 * vez en la frontera —cada petición autenticada y cada evento del despachador—
 * y el único sitio que lo lee es el punto por donde salen TODAS las llamadas
 * HTTP al core. Un camino nuevo no puede olvidarlo, porque no tiene que
 * acordarse de nada.
 *
 * El cambio es delicado, así que entra con interruptor:
 * `FINERACT_TENANT_POR_EMPRESA`. Apagado (lo de hoy) se sigue usando el
 * inquilino global y sólo se avisa cuando una empresa tiene el suyo asignado y
 * no se está usando. Encendido, la empresa que no tenga inquilino no opera
 * contra el core: falla con un mensaje que dice qué falta, en vez de escribir
 * en la casa de otro.
 * ============================================================================
 */

interface Contexto {
  empresaId: string | null;
}

const TTL_MS = 60_000;

@Injectable()
export class ContextoInquilinoService {
  private readonly logger = new Logger(ContextoInquilinoService.name);
  private readonly almacen = new AsyncLocalStorage<Contexto>();
  private readonly cache = new Map<string, { valor: string | null; expira: number }>();

  constructor(
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly configEmpresa: Repository<ConfiguracionIntegracionEmpresa>,
    private readonly config: ConfigService,
  ) {}

  /** Si el inquilino por empresa está exigido en esta instalación. */
  get porEmpresa(): boolean {
    return (
      String(this.config.get<string>('FINERACT_TENANT_POR_EMPRESA') ?? '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  /** Abre el contexto para todo lo que ocurra dentro de `fn`. */
  async ejecutarCon<T>(empresaId: string | null, fn: () => Promise<T>): Promise<T> {
    return this.almacen.run({ empresaId }, fn);
  }

  /**
   * Variante sincrónica, para el interceptor: la suscripción al Observable
   * tiene que ocurrir dentro del contexto y `run` devuelve lo que devuelva la
   * función, sin envolverlo en una promesa.
   */
  ejecutarSincrono<T>(empresaId: string | null, fn: () => T): T {
    return this.almacen.run({ empresaId }, fn);
  }

  /** La empresa de la operación en curso, si alguien la declaró. */
  get empresaActual(): string | null {
    return this.almacen.getStore()?.empresaId ?? null;
  }

  /** El inquilino asignado a una empresa, o `null` si no tiene. */
  async inquilinoDe(empresaId: string): Promise<string | null> {
    const enCache = this.cache.get(empresaId);
    if (enCache && enCache.expira > Date.now()) return enCache.valor;

    let valor: string | null = null;
    try {
      const fila = await this.configEmpresa.findOne({ where: { empresaId } });
      const parametros = (fila?.parametrosProveedor ?? {}) as { tenant?: string };
      valor = parametros.tenant?.trim() || null;
    } catch (error) {
      // Sin configuración legible se comporta como «no tiene»: con el
      // interruptor encendido eso detiene la operación, que es lo correcto.
      this.logger.warn(
        `No se pudo leer el inquilino de la empresa ${empresaId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    this.cache.set(empresaId, { valor, expira: Date.now() + TTL_MS });
    return valor;
  }

  /** Tras asignar un inquilino, para no esperar el minuto del caché. */
  invalidar(empresaId?: string) {
    if (empresaId) this.cache.delete(empresaId);
    else this.cache.clear();
  }
}
