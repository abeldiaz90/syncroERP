import { EntityManager } from 'typeorm';

/**
 * ============================================================================
 * El techo que pone la factura
 * ----------------------------------------------------------------------------
 * Lo que se le puede pagar a un proveedor es el MENOR de dos números: lo que
 * llegó al almacén y lo que facturó. El primero lo mide `valorRecibidoOC`
 * desde que existen las recepciones parciales. El segundo no existía, porque
 * tampoco existía la factura del proveedor en el sistema.
 *
 * Esto vive en una función y no en un método de `FacturasProveedorService` por
 * una razón concreta: quien lo necesita es `pagarOrden`, dentro de su propia
 * transacción y con la orden ya bloqueada. Inyectar un servicio para una
 * consulta habría cambiado el constructor de `OrdenesCompraService`, que
 * cuarenta pruebas construyen a mano, y habría dejado dos caminos posibles al
 * mismo número. Aquí hay uno: el servicio también llama a esta función.
 *
 * Devuelve `null` cuando la orden no tiene ninguna factura capturada, y
 * entonces el pago se comporta exactamente como antes. **Un documento nuevo no
 * puede apagar la operación**: la instalación que todavía no captura facturas
 * de proveedor no se entera de que esto existe, y la que empieza a capturarlas
 * gana el control desde la primera.
 * ============================================================================
 */

export interface TechoDeFacturas {
  /** La suma de los totales de las facturas vigentes de la orden. */
  total: number;
  /** La suma de sus impuestos: el IVA que un CFDI respalda. */
  iva: number;
  /** Cuántas son. Sirve para explicar el tope en la negativa. */
  cuantas: number;
  /** Los folios de las que tienen diferencias sin resolver. */
  conDiferencias: string[];
}

const redondear = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function techoDeFacturas(
  em: EntityManager,
  empresaId: string,
  ordenCompraId: string,
): Promise<TechoDeFacturas | null> {
  const filas = (await em.query(
    `SELECT COUNT(*)::int                           AS cuantas,
            COALESCE(SUM(f.total), 0)::float        AS total,
            COALESCE(SUM(f.impuestos), 0)::float    AS iva,
            COALESCE(
              ARRAY_AGG(f.folio) FILTER (WHERE f.estado = 'CON_DIFERENCIAS'),
              '{}'
            )                                       AS "conDiferencias"
       FROM facturas_proveedor f
      WHERE f.empresaid = $1
        AND f.ordencompraid = $2
        AND f.estado <> 'CANCELADA'`,
    [empresaId, ordenCompraId],
  )) as any[];

  const fila = filas?.[0];
  if (!fila || Number(fila.cuantas ?? 0) === 0) return null;

  return {
    total: redondear(Number(fila.total ?? 0)),
    iva: redondear(Number(fila.iva ?? 0)),
    cuantas: Number(fila.cuantas),
    conDiferencias: Array.isArray(fila.conDiferencias)
      ? fila.conDiferencias.filter(Boolean)
      : [],
  };
}
