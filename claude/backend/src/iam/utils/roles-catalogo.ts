/**
 * ============================================================================
 * Catálogo de roles del ERP
 * ----------------------------------------------------------------------------
 * Un solo sitio donde dice qué roles existen.
 *
 * Había tres listas y no coincidían: las doce plantillas de permisos, una
 * lista de siete en los DTO de alta y edición, y cinco valores sueltos en los
 * `@Roles()` de los controladores. La consecuencia era concreta y se medía:
 * `credito`, `cobranza`, `hoteleria`, `tesoreria`, `contador` y `direccion`
 * tenían plantilla de permisos escrita y funcionando, y **el alta de usuarios
 * no dejaba asignarlos**. Además el único usuario real quedó con rol `ADMIN`,
 * que no estaba en ninguna plantilla, así que el mapeo de roles hacia el
 * registro externo pedía mapear algo que su propio catálogo no ofrecía.
 *
 * La lista buena es la de las plantillas, porque son las que siembran los
 * permisos de verdad. `ADMIN` va aparte: no es un rol con plantilla sino el
 * atajo que `esRolAdministrador()` reconoce y que salta la tabla entera.
 *
 * Quien agregue un rol nuevo: se agrega su plantilla en `plantillas-permisos`
 * y aparece aquí solo. No hay que tocar los DTO.
 * ============================================================================
 */
import { PLANTILLAS_PERMISOS } from '../data/plantillas-permisos';

/** El rol que lo puede todo. No tiene plantilla: salta la tabla de permisos. */
export const ROL_ADMINISTRADOR = 'admin';

/** Roles con plantilla de permisos, en minúsculas como se guardan. */
export const ROLES_CON_PLANTILLA: string[] = PLANTILLAS_PERMISOS.map((p) => p.rol);

/** Todo lo que se puede asignar a un usuario. */
export const ROLES_ASIGNABLES: string[] = [
  ROL_ADMINISTRADOR,
  ...ROLES_CON_PLANTILLA,
];
