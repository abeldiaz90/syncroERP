import type { EstadoPedidoVenta } from '../entities/pedido-venta.entity';

/**
 * ============================================================================
 * LO QUE FALTA POR SURTIR, EN UN SOLO SITIO
 * ----------------------------------------------------------------------------
 * Tres preguntas que el pedido contesta y que, si se contestan en varios
 * lugares, acaban contestándose distinto:
 *
 *   · ¿Cuánto falta de este renglón?
 *   · ¿Cuánto de lo que falta está reservado y cuánto está en espera?
 *   · ¿En qué estado está el pedido?
 *
 * La tercera es la que más se repite —la pantalla quiere pintarla, el servicio
 * quiere guardarla y el reporte quiere filtrarla— y es la que más caro sale
 * duplicar: un pedido que la pantalla pinta SURTIDO y la base guarda
 * SURTIDO_PARCIAL es un cliente al que nadie vuelve a llamar.
 * ============================================================================
 */

/** Contra el error de coma flotante, no contra el cliente. */
export const EPSILON = 0.0001;

export interface RenglonDePedido {
  cantidad: number;
  cantidadSurtida: number;
  cantidadReservada: number;
}

export interface LoQueFalta {
  /** Lo que todavía no sale: `cantidad − surtida`, nunca negativo. */
  pendiente: number;
  /**
   * De lo pendiente, lo que está apartado en el almacén.
   *
   * Se acota contra lo pendiente a propósito. La reserva se consume al surtir,
   * pero si alguien la liberó por fuera —o la dejó expirar— el renglón podría
   * decir que tiene reservado más de lo que le falta, y eso haría parecer
   * disponible mercancía que ya salió.
   */
  reservado: number;
  /**
   * Lo que falta y NO está apartado: el *backorder*. Es el número que hoy no
   * existe en ninguna parte del sistema y por el que el cliente llama.
   */
  enEspera: number;
}

export function loQueFalta(r: RenglonDePedido): LoQueFalta {
  const pendiente = Math.max(0, redondear(Number(r.cantidad) - Number(r.cantidadSurtida ?? 0)));
  const reservado = Math.min(pendiente, Math.max(0, Number(r.cantidadReservada ?? 0)));
  return {
    pendiente,
    reservado,
    enEspera: redondear(pendiente - reservado),
  };
}

const redondear = (n: number) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;

/**
 * El estado del pedido se DERIVA de sus renglones; no se teclea.
 *
 * Es la misma decisión que `estadoDerivadoOC` en compras, y por la misma razón:
 * un estado que se escribe a mano se queda viejo en cuanto alguien toca un
 * renglón por otro camino. Las dos excepciones son los dos estados que no
 * dependen de los renglones sino de un acto: cancelar y seguir en borrador.
 */
export function estadoDerivadoPedido(
  renglones: RenglonDePedido[],
  estadoActual: EstadoPedidoVenta,
): EstadoPedidoVenta {
  if (estadoActual === 'CANCELADO' || estadoActual === 'BORRADOR') {
    return estadoActual;
  }
  const faltantes = renglones.reduce((a, r) => a + loQueFalta(r).pendiente, 0);
  if (faltantes <= EPSILON) return 'SURTIDO';
  const surtido = renglones.reduce((a, r) => a + Number(r.cantidadSurtida ?? 0), 0);
  return surtido > EPSILON ? 'SURTIDO_PARCIAL' : 'CONFIRMADO';
}

/** ¿Queda algo esperando mercancía que no hay? */
export function tieneBackorder(renglones: RenglonDePedido[]): boolean {
  return renglones.some((r) => loQueFalta(r).enEspera > EPSILON);
}
