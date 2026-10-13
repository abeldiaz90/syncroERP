import { EntityManager } from 'typeorm';

import { valorRecibidoOC } from '../entities/orden-compra.entity';
import { techoDeFacturas } from './el-techo-que-pone-la-factura';

/**
 * ============================================================================
 * Lo máximo que se le puede pagar hoy a una orden
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTO EXISTE
 *
 * La regla vivía dentro de `pagarOrden`, y la pantalla de pago a proveedores
 * tenía **su propia copia en el navegador** para precargar el importe y
 * enseñar «Máximo a pagar ahora». La copia decía, con todas sus letras:
 * «Se calcula igual que en el servidor».
 *
 * Dejó de ser verdad dos veces, en silencio:
 *
 *   · cuando el servidor empezó a restar las **devoluciones vigentes** al
 *     proveedor —la pantalla seguía ofreciendo mercancía ya devuelta—;
 *   · cuando empezó a topar con lo **facturado** —la pantalla ofrecía pagar
 *     sin comprobante—.
 *
 * En los dos casos el servidor rechazaba el pago con un mensaje correcto y la
 * pantalla había ofrecido una cifra que nunca iba a aceptar. Es la versión en
 * dos lenguajes del patrón de la casa: **la pieza buena existe y el camino
 * real no la usa.**
 *
 * Así que la cifra se calcula una vez, aquí, y la pantalla la PIDE en vez de
 * deducirla. El día que aparezca un cuarto factor —un anticipo, una nota de
 * crédito— cambia este archivo y la pantalla se entera sola.
 *
 * ── LO QUE DEVUELVE, Y POR QUÉ TANTO ───────────────────────────────────────
 *
 * No sólo el número. También **cuál de los dos lo está apretando**, porque
 * «te falta mercancía» y «te falta papel» se resuelven en sitios distintos y
 * con personas distintas: uno es el almacén, el otro es el proveedor. La
 * negativa del servidor ya lo decía; la pantalla ahora puede decirlo ANTES, que
 * es cuando sirve.
 * ============================================================================
 */

export interface MaximoAPagar {
  /** Valor de lo que llegó, con su impuesto, menos lo devuelto vigente. */
  recibido: number;
  /** Lo que el proveedor facturó de esta orden. `null` = no hay facturas. */
  facturado: number | null;
  /** Comprobantes capturados de esta orden. */
  cuantasFacturas: number;
  /** Folios de las facturas con diferencias sin resolver. */
  conDiferencias: string[];
  /** Lo ya pagado. */
  pagado: number;
  /** Lo que el servidor va a aceptar hoy. Nunca negativo. */
  maximo: number;
  /**
   * Qué limita el pago:
   *   RECIBIDO  — falta que llegue mercancía
   *   FACTURADO — falta que el proveedor facture
   *   PAGADO    — ya está liquidado hasta donde se puede
   */
  aprieta: 'RECIBIDO' | 'FACTURADO' | 'PAGADO';
}

/**
 * Lo devuelto al proveedor que sigue vigente. Una devolución cancelada no
 * reduce nada.
 */
export async function devueltoVigenteDeOrden(
  em: EntityManager,
  empresaId: string,
  ordenCompraId: string,
): Promise<number> {
  const [fila] = await em.query(
    `SELECT COALESCE(SUM(total), 0) AS devuelto
       FROM devoluciones_proveedor
      WHERE empresaid = $1 AND ordencompraid = $2 AND estado = $3`,
    [empresaId, ordenCompraId, 'REGISTRADA'],
  );
  /* SUM() en PostgreSQL devuelve numeric, y numeric llega como TEXTO. */
  const devuelto = Number(fila?.devuelto ?? 0);
  return Number.isFinite(devuelto) && devuelto > 0 ? devuelto : 0;
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export async function maximoAPagar(
  em: EntityManager,
  empresaId: string,
  orden: {
    id: string;
    detalles?: Parameters<typeof valorRecibidoOC>[0] | null;
    totalPagado?: number | null;
  },
): Promise<MaximoAPagar> {
  const devuelto = await devueltoVigenteDeOrden(em, empresaId, orden.id);
  const recibido = Math.max(
    0,
    redondear2(valorRecibidoOC(orden.detalles ?? []) - devuelto),
  );

  const techo = await techoDeFacturas(em, empresaId, orden.id);
  const pagable = techo !== null ? Math.min(recibido, techo.total) : recibido;
  const pagado = Number(orden.totalPagado ?? 0);
  const maximo = Math.max(0, redondear2(pagable - pagado));

  /*
   * El orden importa. Si ya no queda nada que pagar, lo que «aprieta» es lo
   * pagado y no tiene sentido mandar a nadie a buscar una factura.
   */
  const aprieta: MaximoAPagar['aprieta'] =
    maximo <= 0
      ? 'PAGADO'
      : techo !== null && techo.total < recibido
        ? 'FACTURADO'
        : 'RECIBIDO';

  return {
    recibido,
    facturado: techo !== null ? techo.total : null,
    cuantasFacturas: techo?.cuantas ?? 0,
    conDiferencias: techo?.conDiferencias ?? [],
    pagado,
    maximo,
    aprieta,
  };
}
