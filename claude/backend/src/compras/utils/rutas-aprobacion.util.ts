import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';

export const PROCESOS_FINANCIEROS_CENTRALES = [
  'CREDITO_CLIENTE',
  'HOTEL_CONVENIO',
] as const;

export type ProcesoFinancieroCentral =
  (typeof PROCESOS_FINANCIEROS_CENTRALES)[number];

export const esProcesoFinancieroCentral = (proceso: string) =>
  PROCESOS_FINANCIEROS_CENTRALES.includes(
    proceso as ProcesoFinancieroCentral,
  );

/**
 * En procesos financieros los montos representan una escala acumulativa de
 * autoridad. Todos los niveles anteriores al nivel que cubre el importe son
 * obligatorios. Ejemplo: 50k, 250k, sin tope => 300k requiere los tres.
 *
 * Los procesos heredados conservan la selección por rango para no alterar sus
 * circuitos especializados.
 */
export function seleccionarRutaAprobacion(
  configuraciones: ConfiguracionAprobacion[],
  proceso: string,
  importe: number,
) {
  const ordenadas = [...configuraciones].sort((a, b) => a.orden - b.orden);
  if (!esProcesoFinancieroCentral(proceso)) {
    return ordenadas.filter(
      (nivel) =>
        (nivel.montoDesde == null || Number(nivel.montoDesde) <= importe) &&
        (nivel.montoHasta == null || Number(nivel.montoHasta) >= importe),
    );
  }

  const indiceFinal = ordenadas.findIndex(
    (nivel) =>
      nivel.montoHasta == null || Number(nivel.montoHasta) + 0.009 >= importe,
  );
  return indiceFinal < 0 ? [] : ordenadas.slice(0, indiceFinal + 1);
}


export function diagnosticarEscalaFinanciera(
  configuraciones: Array<{
    orden: number;
    montoDesde?: number | null;
    montoHasta?: number | null;
    obligatorio?: boolean;
    permiteAutoaprobacion?: boolean;
    departamentoId?: string | null;
  }>,
): string[] {
  const errores: string[] = [];
  const niveles = [...configuraciones].sort((a, b) => a.orden - b.orden);
  if (!niveles.length) return ['La matriz no tiene niveles activos.'];

  const ordenes = niveles.map((nivel) => Number(nivel.orden));
  if (
    new Set(ordenes).size !== ordenes.length ||
    ordenes.some((orden, indice) => orden !== indice + 1)
  ) {
    errores.push('Los niveles activos deben ser consecutivos: 1, 2, 3…');
  }
  if (niveles.some((nivel) => nivel.departamentoId)) {
    errores.push(
      'Los flujos financieros centrales no pueden depender de un departamento.',
    );
  }
  if (niveles.some((nivel) => nivel.obligatorio === false)) {
    errores.push('Todos los niveles del flujo financiero deben ser obligatorios.');
  }
  if (niveles.some((nivel) => nivel.permiteAutoaprobacion === true)) {
    errores.push('La autoaprobación está prohibida en flujos financieros.');
  }

  let desdeEsperado = 0;
  let topeAnterior = -0.01;
  niveles.forEach((nivel, indice) => {
    const esUltimo = indice === niveles.length - 1;
    const desde = Number(nivel.montoDesde ?? 0);
    if (Math.abs(desde - desdeEsperado) > 0.009) {
      errores.push(
        `El nivel ${indice + 1} debe iniciar en ${desdeEsperado.toFixed(2)}.`,
      );
    }
    if (!esUltimo && nivel.montoHasta == null) {
      errores.push(`El nivel ${indice + 1} necesita un tope de autoridad.`);
      return;
    }
    if (esUltimo && nivel.montoHasta != null) {
      errores.push('El último nivel debe quedar sin tope.');
    }
    if (nivel.montoHasta != null) {
      const hasta = Number(nivel.montoHasta);
      if (!Number.isFinite(hasta) || hasta < 0) {
        errores.push(`El tope del nivel ${indice + 1} no es válido.`);
        return;
      }
      if (hasta <= topeAnterior + 0.009) {
        errores.push(
          `El tope del nivel ${indice + 1} debe superar al nivel anterior.`,
        );
      }
      topeAnterior = hasta;
      desdeEsperado = Math.round((hasta + 0.01) * 100) / 100;
    }
  });

  return [...new Set(errores)];
}


export function asignarRutaSegregada(
  niveles: Array<{ orden: number; candidatos: string[] }>,
  excluidos: Iterable<string> = [],
): Map<number, string> | null {
  const bloqueados = new Set(excluidos);
  const normalizados = niveles
    .map((nivel) => ({
      orden: nivel.orden,
      candidatos: [...new Set(nivel.candidatos)]
        .filter((candidato) => candidato && !bloqueados.has(candidato))
        .sort(),
    }))
    .sort(
      (a, b) =>
        a.candidatos.length - b.candidatos.length || a.orden - b.orden,
    );

  if (normalizados.some((nivel) => nivel.candidatos.length === 0)) {
    return null;
  }

  const utilizados = new Set<string>();
  const asignacion = new Map<number, string>();
  const asignar = (indice: number): boolean => {
    if (indice >= normalizados.length) return true;
    const nivel = normalizados[indice];
    for (const candidato of nivel.candidatos) {
      if (utilizados.has(candidato)) continue;
      utilizados.add(candidato);
      asignacion.set(nivel.orden, candidato);
      if (asignar(indice + 1)) return true;
      asignacion.delete(nivel.orden);
      utilizados.delete(candidato);
    }
    return false;
  };

  return asignar(0) ? asignacion : null;
}

export function existeAsignacionSegregada(
  niveles: Array<{ orden: number; candidatos: string[] }>,
  excluidos: Iterable<string> = [],
): boolean {
  return asignarRutaSegregada(niveles, excluidos) !== null;
}

export function derivarEscalaFinanciera(
  configuraciones: Array<{
    montoHasta?: number;
    [clave: string]: unknown;
  }>,
) {
  let desde = 0;
  return configuraciones.map((nivel) => {
    const resultado = {
      ...nivel,
      montoDesde: desde,
    };
    if (nivel.montoHasta != null) {
      desde = Math.round((Number(nivel.montoHasta) + 0.01) * 100) / 100;
    }
    return resultado;
  });
}
