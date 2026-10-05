/*
 * ============================================================================
 * EL FACTOR DE UN EMPAQUE, EN UN SOLO SITIO
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * La convención del ERP es que **precios y costos viven en la unidad base** y el
 * factor del empaque convierte. La entrada de inventario ya lo hace así —«si
 * compraste una caja de 12 a $120, cada pieza costó $10»— y la salida descuenta
 * `cantidad × factor`.
 *
 * El precio de venta **no lo hacía**, y el resultado era que vender una caja
 * cobraba el precio de una pieza y sacaba doce del almacén. El dato viajaba a
 * propósito —`RenglonSolicitado.equivalenciaId` existe y el POS lo manda—, así
 * que no era una función sin terminar: era una conversión que faltaba en un solo
 * lado de la misma operación.
 *
 * La regla estaba escrita en un método privado del servicio de inventario, de
 * modo que el de precios no podía usarla ni aunque hubiera querido. Ahora es una
 * función, y las dos la llaman. Una sola copia: si un día el factor deja de ser
 * una multiplicación —empaques con merma, o jerarquías anidadas—, cambia aquí y
 * los dos lados cambian juntos.
 *
 * LA RED DE SEGURIDAD, Y POR QUÉ ES 1 Y NO 0
 *
 * Un `factorConversion` nulo, cero o no numérico devolvía `0`, y eso convertía
 * la cantidad entera en cero **en silencio**: una venta que no descuenta nada, o
 * —ahora que el precio también usa el factor— una venta a precio cero. Con `1`,
 * un empaque mal capturado se comporta como la unidad base: se cobra y se
 * descuenta de menos, que se nota, en vez de regalar la mercancía, que no.
 * ============================================================================
 */

/** Lo mínimo que hace falta de una equivalencia para convertir. */
export type EmpaqueConvertible = {
  factorConversion?: number | string | null;
};

/**
 * Cuántas unidades base contiene un empaque.
 *
 * Devuelve `1` cuando no hay empaque o su factor no sirve, así que el resultado
 * siempre se puede multiplicar sin comprobar nada más.
 */
export function factorDeEmpaque(empaque?: EmpaqueConvertible | null): number {
  if (!empaque) return 1;
  const factor = Number(empaque.factorConversion);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}
