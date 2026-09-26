/**
 * ============================================================================
 * Un hueco congelado no es una decisión congelada
 * ----------------------------------------------------------------------------
 * Cada partida de un recibo guarda la cuenta contable que tenía su concepto en
 * el momento del cálculo. Congelarla es correcto: si mañana Contabilidad
 * reclasifica «Horas extra» a otra cuenta, la nómina de marzo tiene que seguir
 * contando la historia de marzo.
 *
 * Pero el congelado se aplicaba también al caso en que NO había nada que
 * congelar. Si el concepto no tenía cuenta, la partida nacía con `null`, y
 * `generarPolizaDetallada` leía ese `null` como si fuera una decisión. El
 * resultado, medido en la instalación el 25-sep-2026: el periodo con fecha de
 * pago 30-sep estaba PAGADO y bloqueado, la póliza de devengo contestaba
 * «faltan cuentas contables», el concepto ya tenía su cuenta asignada en el
 * catálogo, y no existía forma de avanzar —un periodo bloqueado no se
 * recalcula—. Dinero fuera, ningún asiento, y el cierre de septiembre detenido
 * para siempre.
 *
 * `nomina-calculo.service` ya usaba exactamente esta caída al catálogo para
 * decidir si avisar; la contabilización no la usaba para resolver. Esa
 * asimetría era el defecto.
 *
 * La regla, entonces: lo que se congeló manda; lo que quedó vacío se resuelve
 * con el catálogo vigente. Nunca al revés — una cuenta congelada jamás se
 * sustituye por la de hoy.
 * ============================================================================
 */

export interface PartidaConCuenta {
  clave: string;
  cuentaContableId?: string | null;
}

export function cuentaDeLaPartida(
  partida: PartidaConCuenta,
  cuentaVigentePorClave: Map<string, string | null | undefined>,
): string | undefined {
  const congelada = partida.cuentaContableId;
  if (congelada) return congelada;
  const clave = String(partida.clave ?? '').trim().toUpperCase();
  if (!clave) return undefined;
  return cuentaVigentePorClave.get(clave) ?? undefined;
}

/** Índice por clave en mayúsculas, que es como se comparan las claves. */
export function cuentasVigentesPorClave(
  conceptos: ReadonlyArray<{ clave: string; cuentaContableId?: string | null }>,
): Map<string, string | null | undefined> {
  return new Map(
    conceptos.map((c) => [
      String(c.clave ?? '').trim().toUpperCase(),
      c.cuentaContableId,
    ]),
  );
}
