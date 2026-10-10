/**
 * ============================================================================
 * El folio de una póliza: un prefijo, un año y un candado, dichos una vez
 * ----------------------------------------------------------------------------
 * Las pólizas nacen por tres caminos —la captura manual, la captura en
 * transacción y el motor contable— y cada uno tenía su propia copia de estas
 * tres cosas. Con tres resultados distintos:
 *
 *  · **El año salía del reloj del servidor.** `PolizasService.generarFolio`
 *    hacía `new Date().getFullYear()` mientras la póliza guardaba
 *    `anio = fecha.getFullYear()`. Una póliza de diciembre capturada en enero
 *    nacía con folio del año nuevo y campo `anio` del viejo: a partir de ahí
 *    ningún reporte que agrupe por folio cuadra con uno que agrupe por año, y
 *    la numeración del año nuevo arranca con un hueco.
 *
 *  · **Dos candados con llaves distintas.** El motor tomaba
 *    `POLIZA_FOLIO:<empresa>:<TIPO>:<año>` —con el tipo entero, DIARIO— y la
 *    captura en transacción `FOLIO_POLIZA:<empresa>:<PREF>:<año>` —con el
 *    prefijo, DI—. Dos textos distintos son dos candados distintos, así que
 *    una póliza del motor y una de la captura podían generar el MISMO folio a
 *    la vez, cada una creyéndose a salvo.
 *
 *  · **Un camino sin candado.** La captura manual y la reversa no tomaban
 *    ninguno: leían el último folio con `dataSource.query`, fuera de la
 *    transacción que estaba creando la póliza.
 *
 * El candado se nombra por el PREFIJO y no por el tipo porque el prefijo es lo
 * que de verdad va en el folio: dos tipos distintos que caigan en el mismo
 * prefijo comparten numeración y tienen que compartir candado.
 * ============================================================================
 */

const PREFIJOS: Record<string, string> = {
  DIARIO: 'DI',
  INGRESO: 'IN',
  EGRESO: 'EG',
};

export function prefijoDePoliza(tipo: string): string {
  return PREFIJOS[tipo] ?? String(tipo).substring(0, 2).toUpperCase();
}

/** La llave del `pg_advisory_xact_lock`. Un solo texto para los tres caminos. */
export function claveDeFolio(empresaId: string, tipo: string, anio: number): string {
  return `FOLIO_POLIZA:${empresaId}:${prefijoDePoliza(tipo)}:${anio}`;
}

/** El patrón `LIKE` con el que se busca el último folio de ese año. */
export function patronDeFolio(tipo: string, anio: number): string {
  return `${prefijoDePoliza(tipo)}-${anio}-%`;
}

export function siguienteFolio(tipo: string, anio: number, ultimo?: string | null): string {
  const seq = ultimo
    ? Number.parseInt(String(ultimo).split('-')[2] || '0', 10) + 1
    : 1;
  return `${prefijoDePoliza(tipo)}-${anio}-${String(seq).padStart(5, '0')}`;
}
