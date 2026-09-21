import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';

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


/** Lo único que la cadena de firma necesita saber de un nivel de la ruta. */
export type NivelDeRuta = {
  usuarioId?: string | null;
  rolAprobador?: string | null;
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUIÉN FIRMA: persona → rol → suplente → administración
 * ----------------------------------------------------------------------------
 * Esta cadena vivía como función anidada dentro de `requisiciones.service.ts`,
 * y la adjudicación de cotizaciones —el otro punto de compras donde se reparte
 * autoridad— copiaba el `usuarioId` de la ruta tal cual. Dos consecuencias:
 *
 *   · Una ruta por ROL no servía en cotizaciones: si nadie tenía ese rol, el
 *     nivel nacía sin nadie que pudiera resolverlo. Y enrutar por rol es lo
 *     que hace falta para que la adjudicación deje de firmarla quien después
 *     la contabiliza.
 *   · Dar de baja a la persona nombrada dejaba las adjudicaciones trabadas,
 *     que es exactamente el problema que la cadena resuelve en requisiciones.
 *
 * Business Central lo resuelve con Approver ID → Substitute → administrador de
 * aprobaciones. Aquí es la misma idea: el nivel dice a quién le toca, y si esa
 * persona ya no puede, lo toma alguien con su misma autoridad.
 *
 * Recibe el padrón COMPLETO, no sólo los activos, y por un motivo concreto: el
 * escalón 3 busca a alguien con el rol que tenía la persona nombrada, y esa
 * persona está inactiva por definición —si estuviera activa habríamos salido
 * en el escalón 1—. Con una lista de sólo activos ese escalón no encontraba
 * nunca al original y era código muerto. Firmar, firman sólo los activos.
 *
 * Lo que NUNCA cambia, en ningún escalón, es que el solicitante no se firma a
 * sí mismo. Por eso `noEsElSolicitante` se aplica en los cuatro y no como
 * filtro final: al final devolvería null donde la cadena todavía tenía a quién
 * recurrir.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function resolverFirmante(
  nivel: NivelDeRuta,
  padron: Usuario[],
  solicitanteId: string,
): Usuario | null {
  const noEsElSolicitante = (u: Usuario) => u.id !== solicitanteId;
  const activos = padron.filter((u) => u.activo !== false);
  const activoPorId = new Map(activos.map((u) => [u.id, u]));

  // 1. La persona que la ruta nombra, si sigue activa.
  const nombrado = nivel.usuarioId ? activoPorId.get(nivel.usuarioId) : null;
  if (nombrado && noEsElSolicitante(nombrado)) return nombrado;

  // 2. El rol que la ruta nombra.
  const rolPedido = nivel.rolAprobador ?? nombrado?.rol ?? null;
  if (rolPedido) {
    const porRol = activos.find(
      (u) =>
        normalizarRol(u.rol) === normalizarRol(rolPedido) &&
        noEsElSolicitante(u),
    );
    if (porRol) return porRol;
  }

  // 3. El rol que tenía la persona nombrada, aunque ella ya no esté.
  if (nivel.usuarioId && !nombrado) {
    const original = padron.find((u) => u.id === nivel.usuarioId);
    if (original) {
      const suplente = activos.find(
        (u) =>
          normalizarRol(u.rol) === normalizarRol(original.rol) &&
          noEsElSolicitante(u),
      );
      if (suplente) return suplente;
    }
  }

  // 4. Administración, que es el último responsable de que esto no se pare.
  return (
    activos.find((u) => esRolAdministrador(u.rol) && noEsElSolicitante(u)) ??
    activos.find((u) => u.esPropietario && noEsElSolicitante(u)) ??
    null
  );
}
