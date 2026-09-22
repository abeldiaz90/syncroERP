/** Normaliza roles históricos y evita diferencias por mayúsculas, espacios o guiones. */
export function normalizarRol(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ROLES_ADMIN = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRATOR',
  'SUPER_ADMIN',
  'SUPERADMIN',
  'SUPER_ADMINISTRADOR',
]);

export function esRolAdministrador(valor: unknown): boolean {
  return ROLES_ADMIN.has(normalizarRol(valor));
}

/**
 * ============================================================================
 * Una sola forma de preguntar «¿este rol es el que hace falta?»
 * ----------------------------------------------------------------------------
 * `normalizarRol` existe desde el principio y aun asi la comparacion a mano
 * aparecio TRES veces, y las tres decidiendo autorizacion:
 *
 *   · La lista de roles con traza completa de aprobaciones, en minusculas
 *     contra el rol normalizado —que sale en MAYUSCULAS—. No acertaba nunca:
 *     `gobierno` entraba a su bandeja y el historial salia vacio.
 *   · `obtenerEmpleado`, con su propia normalizacion en minusculas y su propia
 *     lista de roles, dejando pasar el sueldo de toda la plantilla.
 *   · Seis sitios en RRHH y estructura organizacional comparando
 *     `String(usuario.rol).toLowerCase()` contra literales.
 *
 * El fallo comun del tercer caso es `rol !== 'admin'`: el sistema reconoce seis
 * escrituras de administrador y esa comparacion solo acepta una. Un usuario con
 * rol `administrador` quedaba fuera de las etapas de aprobacion sin que nadie
 * entendiera por que.
 *
 * Dos funciones y no una, porque son dos preguntas distintas:
 *
 *   · `rolCoincideCon` es literal: el administrador NO pasa por ser
 *     administrador. Es lo que hace falta cuando la regla es «esta etapa es de
 *     Finanzas» y se quiere saber si quien llega es de Finanzas.
 *   · `rolAutorizado` es la de un guardia: alguno de estos, o el
 *     administrador, que es como se comportan casi todos los controles.
 *
 * Mezclarlas es como se abren estos huecos, asi que el nombre lo dice.
 * ============================================================================
 */
export function rolCoincideCon(
  valor: unknown,
  permitidos: readonly (string | null | undefined)[],
): boolean {
  const mio = normalizarRol(valor);
  if (!mio) return false;
  return permitidos
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    .map(normalizarRol)
    .includes(mio);
}

/** ¿Es alguno de estos, o el administrador? El caso habitual de un guardia. */
export function rolAutorizado(
  valor: unknown,
  permitidos: readonly (string | null | undefined)[],
): boolean {
  return esRolAdministrador(valor) || rolCoincideCon(valor, permitidos);
}
