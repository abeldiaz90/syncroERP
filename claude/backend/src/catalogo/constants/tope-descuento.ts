import { normalizarRol } from '../../iam/utils/roles.util';

/**
 * ============================================================================
 * SyncroERP · Cuánto descuento se puede dar en el mostrador
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * El tope de descuento vivía en un objeto literal dentro de `precios.service`,
 * escrito contra roles que este ERP no tiene —CAJERO, VENDEDOR, GERENTE,
 * SUPERVISOR—. Los trece roles reales son empleado, almacenista, comprador,
 * finanzas, contador, tesoreria, credito, cobranza, hoteleria, rrhh, gerencia,
 * direccion y gobierno. El mostrador vende con `empleado`, que no aparecía más
 * que con un cero, y la pantalla ofrecía el campo igual. El resultado era un
 * carrito que se dejaba armar y que el servidor rechazaba al cobrar.
 *
 * QUÉ HACEN LOS ERP QUE SÍ RESUELVEN ESTO
 *
 * En SAP Business One el tope es un dato de autorización por usuario
 * («Maximum Discount %»); en Dynamics 365 Commerce es una propiedad del grupo
 * de permisos del POS; en Odoo los módulos de límite de descuento lo cuelgan
 * del grupo de usuario. Los tres coinciden en tres cosas, y son las tres que
 * se implementan aquí:
 *
 *   1. El tope es DATO configurable, no una constante escondida en el código.
 *   2. Lo aplica el SERVIDOR al calcular el importe, siempre, sin excepción.
 *   3. La CAJA CONOCE EL TOPE y no deja teclear por encima: la pantalla no
 *      ofrece lo que el servidor va a rechazar.
 *
 * Lo que NO se implementa —y se dice en voz alta en lugar de simularlo— es la
 * autorización de un supervisor en el mostrador. Ese circuito necesita que
 * alguien con más rango se identifique en la caja del cajero, y ese flujo no
 * existe en este sistema. Mientras no exista, no hay «pide autorización»: hay
 * un tope, y por encima del tope el camino es la lista de precios.
 *
 * LA POLÍTICA POR DEFECTO
 *
 * Los mismos roles que autorizan una anulación o una devolución son los que
 * pueden rebajar en el mostrador, y por la misma razón: un descuento sin
 * rastro es una devolución sin rastro. `direccion` 20 %, `gerencia` 10 %, el
 * administrador todo, y los demás —`empleado` incluido— cero. Cero no es un
 * olvido: es la política, y por eso la caja le quita el campo al cajero en vez
 * de dejárselo puesto para que fracase.
 *
 * Y conviene decir lo que eso significa HOY, sin adornos: el único rol que
 * puede registrar una venta es `empleado` —`gerencia` y `direccion` tienen
 * `ventas` en CONSULTA—, así que con la tabla por defecto el mostrador no
 * descuenta y el campo no aparece. Los renglones de `direccion` y `gerencia`
 * no son decoración: rigen si alguien les da la venta, y dejan escrito cuál
 * es el orden si mañana se abre. Si SUMA quiere que la caja pueda rebajar, la
 * palanca es la variable de abajo, no un parche en la pantalla.
 *
 * CÓMO SE CAMBIA SIN TOCAR CÓDIGO
 *
 *   VENTAS_TOPES_DESCUENTO="EMPLEADO:5,GERENCIA:15"
 *
 * Pares `ROL:PORCENTAJE` separados por coma. Si la variable está puesta,
 * sustituye a la tabla entera —no la completa—, de modo que lo que se lea ahí
 * es exactamente lo que rige. Un par mal escrito se ignora; un rol que no
 * aparece vale cero. El administrador se mantiene fuera de la variable: su
 * 100 % es parte de lo que significa ser administrador en este sistema.
 * ============================================================================
 */

/** Tabla por defecto. Se sustituye entera si `VENTAS_TOPES_DESCUENTO` viene. */
export const TOPES_DESCUENTO_POR_DEFECTO: Readonly<Record<string, number>> = {
  DIRECCION: 20,
  GERENCIA: 10,
  /** Nombres de otro esquema de roles; se conservan por instalaciones viejas. */
  GERENTE: 10,
  SUPERVISOR: 10,
};

/** El administrador no está sujeto a la tabla ni a la variable de entorno. */
const TOPE_ADMINISTRADOR = 100;
const ROLES_ADMINISTRADOR = new Set([
  'ADMIN',
  'ADMINISTRADOR',
  'ADMINISTRATOR',
  'SUPER_ADMIN',
  'SUPERADMIN',
  'SUPER_ADMINISTRADOR',
]);

const acotarPorcentaje = (valor: number): number =>
  Math.min(100, Math.max(0, valor));

/**
 * Lee la tabla vigente. Se resuelve en cada llamada a propósito: cambiar la
 * variable y reiniciar basta, sin recompilar ni tocar una constante congelada
 * en el arranque de un módulo.
 */
export const TOPES_DESCUENTO_MOSTRADOR = (): Map<string, number> => {
  const crudo = process.env.VENTAS_TOPES_DESCUENTO;
  if (crudo === undefined) {
    return new Map(
      Object.entries(TOPES_DESCUENTO_POR_DEFECTO).map(([rol, tope]) => [
        normalizarRol(rol),
        acotarPorcentaje(tope),
      ]),
    );
  }

  const tabla = new Map<string, number>();
  for (const par of crudo.split(',')) {
    const [rolCrudo, topeCrudo] = par.split(':');
    const rol = normalizarRol(rolCrudo);
    const tope = Number(topeCrudo);
    if (!rol || !Number.isFinite(tope)) continue;
    tabla.set(rol, acotarPorcentaje(tope));
  }
  return tabla;
};

/**
 * Porcentaje máximo de descuento que este rol puede aplicar por renglón.
 * Sin rol, o con un rol que nadie configuró, es cero: quien no aparece en la
 * política no descuenta.
 */
export const topeDescuentoDeRol = (rol?: string | null): number => {
  const normalizado = normalizarRol(rol);
  if (!normalizado) return 0;
  if (ROLES_ADMINISTRADOR.has(normalizado)) return TOPE_ADMINISTRADOR;
  return TOPES_DESCUENTO_MOSTRADOR().get(normalizado) ?? 0;
};
