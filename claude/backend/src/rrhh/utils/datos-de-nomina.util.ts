import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';

/**
 * ============================================================================
 * Quién puede ver cuánto gana la gente
 * ----------------------------------------------------------------------------
 * `gerencia` y `direccion` tienen el módulo `rrhh` en consulta, que es
 * razonable —plantilla, asistencia, incidencias, vacaciones— y venía con el
 * sueldo dentro: `GET /rrhh/empleados` devolvía `salarioDiario` y
 * `salarioDiarioIntegrado` de toda la nómina a cualquiera que pudiera leer la
 * lista. Verificado en vivo el 22-sep con la sesión de Gerencia: 200 y la
 * lista completa.
 *
 * El recorte de datos personales YA existía y estaba bien pensado —CURP, RFC,
 * NSS y CLABE salen enmascarados— pero el salario no entraba en él. Es el dato
 * que más gente pregunta y el único que no se tapaba.
 *
 * Tres cosas que este archivo corrige de raíz, y no sólo el síntoma:
 *
 *  · `obtenerEmpleado` normalizaba el rol a mano, en MINÚSCULAS, mientras
 *    `normalizarRol` —la función del sistema— devuelve MAYÚSCULAS. Eran dos
 *    definiciones de «el mismo rol» y la de aquí no conocía los alias de
 *    administrador. Ya costó una vez: la lista de roles con traza completa de
 *    aprobaciones estaba en minúsculas y no acertaba NUNCA.
 *  · Tenía su propia lista de roles escrita a mano, la sexta del sistema.
 *  · `listarEmpleados` no recibía el rol, así que el recorte sólo se aplicaba
 *    al abrir una ficha y no al listar las cien.
 *
 * Quien agregue un rol aquí está decidiendo que esa gente vea los sueldos de
 * sus compañeros. Que sea una línea visible, con esta nota al lado, es el
 * punto.
 * ============================================================================
 */
export const ROLES_CON_DATOS_DE_NOMINA = ['rrhh'] as const;

/** ¿Este rol ve sueldos y datos de dispersión? */
export function verDatosDeNomina(rol?: string): boolean {
  if (esRolAdministrador(rol)) return true;
  const mio = normalizarRol(rol);
  if (!mio) return false;
  return ROLES_CON_DATOS_DE_NOMINA.map(normalizarRol).includes(mio);
}

/** Los campos que se van cuando no. */
export const CAMPOS_DE_NOMINA = [
  'salarioDiario',
  'salarioDiarioIntegrado',
] as const;

/**
 * Quita la compensación de un registro de empleado. Devuelve una copia: el
 * objeto que entra puede ser una entidad de TypeORM y borrarle columnas en
 * sitio es cómo se acaba guardando un salario en cero.
 */
export function sinDatosDeNomina<T extends Record<string, unknown>>(
  registro: T,
): T {
  const copia = { ...registro };
  for (const campo of CAMPOS_DE_NOMINA) delete copia[campo];
  return copia;
}
