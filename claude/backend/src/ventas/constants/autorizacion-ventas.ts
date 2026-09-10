/**
 * ============================================================================
 * SyncroERP · Autorización de anulaciones y devoluciones
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * `PATCH /ventas/:id/anular` no recibía el rol del usuario y el servicio de
 * anulación no contenía una sola comprobación de autorización. La plantilla
 * de permisos del rol `empleado` (vendedor de mostrador) incluye el prefijo
 * `/ventas`, así que cualquier cajero podía anular CUALQUIER venta de la
 * empresa —no sólo las suyas— sin umbral, sin aprobación y sin dejar rastro
 * de quién autorizó.
 *
 * Las devoluciones sí tenían un umbral, pero cableado con `process.env` dentro
 * del servicio, invisible desde la pantalla de permisos. Aquí queda un único
 * punto para ambas operaciones.
 *
 * NOTA SOBRE LOS NOMBRES DE ROL
 * Las plantillas de permisos usan `gerencia`; la variable de entorno original
 * de devoluciones usaba `GERENTE` y `SUPERVISOR`, que no existen como rol en
 * el sistema. Se conservan por compatibilidad con instalaciones existentes,
 * pero el conjunto por defecto ya incluye los nombres reales.
 * ============================================================================
 */

export const normalizarRolAutorizador = (rol?: string): string =>
  (rol ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const leerRoles = (variable: string, porDefecto: string): Set<string> =>
  new Set(
    (process.env[variable] ?? porDefecto)
      .split(',')
      .map(normalizarRolAutorizador)
      .filter(Boolean),
  );

const leerUmbral = (variable: string, porDefecto: number): number => {
  const crudo = Number(process.env[variable]);
  return Number.isFinite(crudo) && crudo >= 0 ? crudo : porDefecto;
};

/** Roles que pueden autorizar una anulación por encima del umbral. */
export const ROLES_AUTORIZADORES_ANULACION = (): Set<string> =>
  leerRoles(
    'ANULACIONES_ROLES_AUTORIZADORES',
    'ADMIN,ADMINISTRADOR,SUPER_ADMIN,GERENCIA,DIRECCION,GERENTE,SUPERVISOR',
  );

/**
 * Importe a partir del cual la anulación exige un rol autorizador.
 * Se fija en cero por defecto a propósito: anular es más destructivo que
 * devolver —elimina la venta completa— y no debería estar al alcance de un
 * cajero por ningún importe. Quien quiera el comportamiento anterior puede
 * subir el umbral explícitamente.
 */
export const UMBRAL_APROBACION_ANULACION = (): number =>
  leerUmbral('ANULACIONES_MONTO_APROBACION', 0);

export const ROLES_AUTORIZADORES_DEVOLUCION = (): Set<string> =>
  leerRoles(
    'DEVOLUCIONES_ROLES_AUTORIZADORES',
    'ADMIN,ADMINISTRADOR,SUPER_ADMIN,GERENCIA,DIRECCION,GERENTE,SUPERVISOR',
  );

export const UMBRAL_APROBACION_DEVOLUCION = (): number =>
  leerUmbral('DEVOLUCIONES_MONTO_APROBACION', 5000);
