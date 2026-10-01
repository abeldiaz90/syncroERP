import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';

/**
 * ============================================================================
 * Quién ve la traza completa de aprobaciones
 * ----------------------------------------------------------------------------
 * Esta regla vivía dentro de `aprobaciones-documentos.service.ts`. Se saca a su
 * propio archivo porque la necesita también el historial de compras, y hacer
 * que `RequisicionesService` importe el servicio de la bandeja central para
 * leer una función pura arrastraría con él medio árbol de dependencias
 * —integración, motor de validación, publicador de cartera— y abriría un ciclo
 * entre dos módulos que hoy no se conocen.
 *
 * Es una función sin estado y sin dependencias de Nest: su sitio es un util.
 * El servicio la sigue reexportando, así que nada de lo que ya la importaba
 * cambia.
 * ============================================================================
 */

/**
 * Roles que ven la traza completa sin ser administradores.
 *
 * Uno solo, y no por casualidad: `gobierno` es el rol que escribe la matriz de
 * aprobación y tiene vedado `PATCH /aprobaciones/:id/resolver`. No se puede
 * gobernar lo que no se ve —el expediente de María Fernanda estuvo tres días
 * parado y nadie lo miraba— y es seguro dárselo precisamente porque no puede
 * actuar sobre nada de lo que ve. Ésa es la posición del auditor.
 *
 * Quien agregue un rol a esta lista está ampliando quién lee expedientes
 * crediticios ajenos: nombre, RFC, límite y nivel de riesgo. Que sea un rol que
 * no pueda firmar nada no es un detalle, es la condición.
 */
export const ROLES_CON_TRAZA_COMPLETA = ['gobierno'] as const;

/**
 * ¿Este rol ve la traza entera?
 *
 * Compara con `normalizarRol` en LOS DOS lados. La primera versión comparaba la
 * lista en minúsculas contra el rol ya normalizado —que sale en MAYÚSCULAS— así
 * que no acertaba nunca: `gobierno` entraba a su bandeja y el historial le
 * salía vacío, con la regla escrita, la prueba en verde y el comportamiento al
 * revés del diseñado.
 *
 * Es literalmente el error contra el que avisa el comentario del guardia de
 * roles —«comparar literalmente haría que encender esto dejara gente fuera por
 * una mayúscula»— cometido un archivo más allá. Por eso esto es una función con
 * su prueba y no una comparación suelta en medio de una consulta.
 */
export function veTrazaCompleta(rol?: string): boolean {
  if (esRolAdministrador(rol)) return true;
  const mio = normalizarRol(rol);
  if (!mio) return false;
  return ROLES_CON_TRAZA_COMPLETA.map(normalizarRol).includes(mio);
}
