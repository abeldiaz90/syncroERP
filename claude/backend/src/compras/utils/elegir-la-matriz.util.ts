/**
 * ============================================================================
 * Una matriz de aprobación no se mezcla con otra
 * ----------------------------------------------------------------------------
 * Una matriz se identifica por el PAR `proceso` + `departamentoId`: lo dice el
 * guardado, que borra y reescribe por ese par, y el diagnóstico de salud, que
 * agrupa por `proceso::depto`.
 *
 * La adjudicación de cotizaciones filtraba sólo por `proceso`, así que una
 * empresa con la matriz global y la de un departamento mandaba a firma los
 * niveles de LAS DOS a la vez. Firmas de más —gente que según su matriz no
 * tenía por qué ver el documento— y, peor, firmas de MENOS: los firmantes se
 * indexan por `orden`, así que el nivel 1 de la segunda matriz pisaba al de la
 * primera y un firmante declarado desaparecía sin que nada lo dijera.
 *
 * La regla vive aquí y no dentro del servicio para poder probarla: elegir mal
 * la matriz no se ve en ninguna pantalla, sólo en una bandeja que no recibe lo
 * que debería.
 * ============================================================================
 */

export interface NivelDeMatriz {
  orden: number;
  departamentoId?: string | null;
  montoDesde?: number | string | null;
  montoHasta?: number | string | null;
}

/** La matriz que aplica: la del departamento si existe, si no la global. */
export function matrizQueAplica<T extends NivelDeMatriz>(
  candidatas: T[],
  departamentoId?: string | null,
): T[] {
  const delDepartamento = candidatas.filter(
    (c) => c.departamentoId && c.departamentoId === departamentoId,
  );
  return delDepartamento.length
    ? delDepartamento
    : candidatas.filter((c) => !c.departamentoId);
}

/** Los niveles de ESA matriz cuya banda cubre el importe. */
export function nivelesParaElImporte<T extends NivelDeMatriz>(
  matriz: T[],
  total: number,
): T[] {
  return matriz
    .filter((c) => {
      const desde = c.montoDesde === null || c.montoDesde === undefined ? null : Number(c.montoDesde);
      const hasta = c.montoHasta === null || c.montoHasta === undefined ? null : Number(c.montoHasta);
      if (desde !== null && total < desde) return false;
      if (hasta !== null && total > hasta) return false;
      return true;
    })
    .sort((a, b) => a.orden - b.orden);
}
