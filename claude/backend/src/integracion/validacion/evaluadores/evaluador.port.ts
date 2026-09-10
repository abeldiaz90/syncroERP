import { PasoFlujoValidacion } from '../entities/paso-flujo-validacion.entity';
import { ResultadoPaso, TipoPasoValidacion } from '../validacion.constants';

/** Lo que el motor le entrega a cada paso para que decida. */
export interface ContextoValidacion {
  empresaId: string;
  clienteId: string;
  nombre: string;
  rfc?: string | null;
  curp?: string | null;
  limiteSolicitado: number;
  /** Folio de la autorización firmada del titular para consultar burós. */
  folioAutorizacionBuro?: string | null;
  /** Id del cliente en el registro externo, si ya está replicado. */
  clienteIdExterno?: string | null;
  /**
   * Respuestas forzadas por tipo de paso. Sólo se usa al simular: permite al
   * administrador ver cómo se comporta su flujo ante un buró bajo o una
   * identidad rechazada sin tener que provocarlo de verdad.
   */
  simulado?: Partial<Record<TipoPasoValidacion, ResultadoPaso>>;
}

export interface SalidaPaso {
  resultado: ResultadoPaso;
  /** Puntaje propio del proveedor, si lo da. 0-100. */
  puntaje?: number | null;
  proveedor?: string | null;
  detalle?: string | null;
  evidencia?: Record<string, unknown> | null;
}

/**
 * Un paso del flujo, resuelto contra su proveedor.
 *
 * La regla que comparten todas las implementaciones: **sin proveedor
 * configurado se devuelve NO_DISPONIBLE, jamás APROBADO**. Un evaluador
 * permisivo por omisión es la clase de decisión que se olvida y termina
 * otorgando crédito sin validar a nadie.
 */
export interface EvaluadorPaso {
  readonly tipo: TipoPasoValidacion;
  evaluar(
    contexto: ContextoValidacion,
    paso: PasoFlujoValidacion,
  ): Promise<SalidaPaso>;
}
