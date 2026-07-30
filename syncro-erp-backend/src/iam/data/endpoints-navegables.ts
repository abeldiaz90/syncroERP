/**
 * ============================================================================
 * SyncroERP · Endpoints navegables
 * ----------------------------------------------------------------------------
 * Traduce "este rol puede llamar a GET /catalogo/productos" a "este rol ve la
 * pantalla /dashboard/productos". Es lo que alimenta al menú lateral y al
 * panel principal para los usuarios que no son administradores.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE (y por qué era el segundo motivo de que la
 * navegación no se pintara):
 *
 * 1. El mapa vivía dentro de `permisos-dinamicos.service.ts` y cubría 38 de
 *    las ~80 pantallas. Todo lo que no estuviera aquí, para un usuario no
 *    administrador, simplemente NO APARECÍA en el menú aunque tuviera el
 *    permiso concedido: reportes completos, hotelería salvo tres pantallas,
 *    cotizaciones de compra, auditoría, cierre contable, atributos…
 *
 * 2. El servicio, cuando no encontraba entrada aquí, INVENTABA la ruta con
 *    `/dashboard${ep.ruta}`. Eso generaba rutas que no existen en Next
 *    (`/dashboard/catalogo/productos`, `/dashboard/credito/creditos`) y que
 *    además no coinciden con las del menú, así que el permiso se concedía a
 *    una URL fantasma mientras la pantalla real quedaba bloqueada.
 *    → La inferencia debe eliminarse; ver GUIA-DE-INTEGRACION.md.
 *
 * REGLA: la `rutaFrontend` debe existir como carpeta en
 * `syncro-erp-frontend/app/...` y coincidir exactamente con el `href` de
 * `module-config.ts`. Si no coincide, el permiso no sirve de nada.
 * ============================================================================
 */

export interface EndpointNavMeta {
  rutaFrontend: string;
  titulo: string;
  modulo: string;
  ordenMenu: number;
}

export const ENDPOINTS_NAVEGABLES: Record<string, EndpointNavMeta> = {
  /* ── VENTAS ────────────────────────────────────────────────────────────── */
  'GET /ventas': {
    rutaFrontend: '/dashboard/ventas/historial',
    titulo: 'Historial de ventas',
    modulo: 'ventas',
    ordenMenu: 2,
  },
  'GET /ventas/dashboard/metricas': {
    rutaFrontend: '/dashboard/ventas/pos',
    titulo: 'Punto de venta',
    modulo: 'ventas',
    ordenMenu: 1,
  },
  'POST /ventas': {
    rutaFrontend: '/dashboard/ventas/pos',
    titulo: 'Punto de venta',
    modulo: 'ventas',
    ordenMenu: 1,
  },

  /* ── COMPRAS ───────────────────────────────────────────────────────────── */
  'GET /compras/requisiciones': {
    rutaFrontend: '/dashboard/compras/requisiciones',
    titulo: 'Requisiciones',
    modulo: 'compras',
    ordenMenu: 10,
  },
  'GET /compras/cotizaciones': {
    rutaFrontend: '/dashboard/compras/cotizaciones',
    titulo: 'Cotizaciones',
    modulo: 'compras',
    ordenMenu: 11,
  },
  'GET /compras/requisiciones/aprobaciones/pendientes': {
    rutaFrontend: '/dashboard/compras/aprobaciones',
    titulo: 'Aprobaciones',
    modulo: 'compras',
    ordenMenu: 12,
  },
  'GET /compras/ordenes': {
    rutaFrontend: '/dashboard/compras/ordenes',
    titulo: 'Órdenes de compra',
    modulo: 'compras',
    ordenMenu: 13,
  },
  'GET /compras/ordenes/recepciones': {
    rutaFrontend: '/dashboard/inventario/recepciones',
    titulo: 'Recepciones',
    modulo: 'compras',
    ordenMenu: 14,
  },
  'PATCH /compras/ordenes/:id/pagar': {
    rutaFrontend: '/dashboard/compras/pago-proveedores',
    titulo: 'Pago a proveedores',
    modulo: 'compras',
    ordenMenu: 15,
  },
  'GET /configuraciones-aprobacion/:id': {
    rutaFrontend: '/dashboard/configuraciones-aprobacion',
    titulo: 'Flujos de aprobación',
    modulo: 'compras',
    ordenMenu: 16,
  },

  /* ── INVENTARIO ────────────────────────────────────────────────────────── */
  'GET /catalogo/productos': {
    rutaFrontend: '/dashboard/productos',
    titulo: 'Productos',
    modulo: 'inventario',
    ordenMenu: 20,
  },
  'GET /catalogo/productos/atributos': {
    rutaFrontend: '/dashboard/productos/atributos',
    titulo: 'Atributos y variantes',
    modulo: 'inventario',
    ordenMenu: 21,
  },
  'GET /catalogo/categorias': {
    rutaFrontend: '/dashboard/categorias',
    titulo: 'Categorías',
    modulo: 'inventario',
    ordenMenu: 22,
  },
  'GET /catalogo/marcas': {
    rutaFrontend: '/dashboard/marcas',
    titulo: 'Marcas',
    modulo: 'inventario',
    ordenMenu: 23,
  },
  'GET /catalogo/unidades-medida': {
    rutaFrontend: '/dashboard/unidades-medida',
    titulo: 'Unidades de medida',
    modulo: 'inventario',
    ordenMenu: 24,
  },
  'GET /catalogo/almacenes': {
    rutaFrontend: '/dashboard/almacenes',
    titulo: 'Almacenes',
    modulo: 'inventario',
    ordenMenu: 25,
  },
  'POST /catalogo/inventario/productos/transferir': {
    rutaFrontend: '/dashboard/inventario/transferencias',
    titulo: 'Transferencias',
    modulo: 'inventario',
    ordenMenu: 26,
  },
  'POST /catalogo/inventario/productos/ajuste': {
    rutaFrontend: '/dashboard/inventario/ajustes',
    titulo: 'Ajustes de stock',
    modulo: 'inventario',
    ordenMenu: 27,
  },
  'POST /catalogo/inventario/stock-inicial': {
    rutaFrontend: '/dashboard/inventario/stock-inicial',
    titulo: 'Stock inicial',
    modulo: 'inventario',
    ordenMenu: 28,
  },
  'POST /catalogo/productos/importar': {
    rutaFrontend: '/dashboard/inventario/importar',
    titulo: 'Importar desde Excel',
    modulo: 'inventario',
    ordenMenu: 29,
  },

  /* ── CATÁLOGOS ─────────────────────────────────────────────────────────── */
  'GET /clientes': {
    rutaFrontend: '/dashboard/clientes',
    titulo: 'Clientes',
    modulo: 'catalogos',
    ordenMenu: 30,
  },
  'GET /proveedores': {
    rutaFrontend: '/dashboard/proveedores',
    titulo: 'Proveedores',
    modulo: 'catalogos',
    ordenMenu: 31,
  },
  'GET /catalogo/listas-precio': {
    rutaFrontend: '/dashboard/listas-precio',
    titulo: 'Listas de precio',
    modulo: 'catalogos',
    ordenMenu: 32,
  },
  'GET /catalogo/impuestos': {
    rutaFrontend: '/dashboard/impuestos',
    titulo: 'Impuestos',
    modulo: 'catalogos',
    ordenMenu: 33,
  },
  'GET /catalogos/formas-pago': {
    rutaFrontend: '/dashboard/catalogos/formas-pago',
    titulo: 'Formas de pago',
    modulo: 'catalogos',
    ordenMenu: 34,
  },
  'GET /catalogos/bancos': {
    rutaFrontend: '/dashboard/catalogos/bancos',
    titulo: 'Bancos',
    modulo: 'catalogos',
    ordenMenu: 35,
  },
  'GET /catalogos/paises': {
    rutaFrontend: '/dashboard/catalogos/paises',
    titulo: 'Países',
    modulo: 'catalogos',
    ordenMenu: 36,
  },
  'GET /catalogos/estados': {
    rutaFrontend: '/dashboard/catalogos/estados',
    titulo: 'Estados',
    modulo: 'catalogos',
    ordenMenu: 37,
  },

  /* ── FINANZAS ──────────────────────────────────────────────────────────── */
  'GET /finanzas/polizas': {
    rutaFrontend: '/dashboard/finanzas/polizas',
    titulo: 'Libro diario',
    modulo: 'finanzas',
    ordenMenu: 40,
  },
  'POST /finanzas/polizas': {
    rutaFrontend: '/dashboard/finanzas/polizas/nueva',
    titulo: 'Nueva póliza',
    modulo: 'finanzas',
    ordenMenu: 41,
  },
  'GET /finanzas/polizas/saldos-iniciales': {
    rutaFrontend: '/dashboard/finanzas/saldos-iniciales',
    titulo: 'Saldos iniciales',
    modulo: 'finanzas',
    ordenMenu: 42,
  },
  'GET /finanzas/polizas/balanza': {
    rutaFrontend: '/dashboard/finanzas/balanza',
    titulo: 'Balanza de comprobación',
    modulo: 'finanzas',
    ordenMenu: 43,
  },
  'GET /finanzas/polizas/resultado': {
    rutaFrontend: '/dashboard/finanzas/estado-resultados',
    titulo: 'Estado de resultados',
    modulo: 'finanzas',
    ordenMenu: 44,
  },
  'GET /finanzas/polizas/balance': {
    rutaFrontend: '/dashboard/finanzas/balance-general',
    titulo: 'Balance general',
    modulo: 'finanzas',
    ordenMenu: 45,
  },
  'GET /finanzas/polizas/iva': {
    rutaFrontend: '/dashboard/finanzas/declaracion-iva',
    titulo: 'Declaración de IVA',
    modulo: 'finanzas',
    ordenMenu: 46,
  },
  'POST /finanzas/polizas/cierre': {
    rutaFrontend: '/dashboard/finanzas/cierre-contable',
    titulo: 'Cierre contable',
    modulo: 'finanzas',
    ordenMenu: 47,
  },
  'GET /finanzas/cuentas-contables': {
    rutaFrontend: '/dashboard/finanzas/cuentas-contables',
    titulo: 'Catálogo de cuentas',
    modulo: 'finanzas',
    ordenMenu: 48,
  },
  'GET /catalogo/categorias-contables': {
    rutaFrontend: '/dashboard/finanzas/categorias-contables',
    titulo: 'Categorías contables',
    modulo: 'finanzas',
    ordenMenu: 49,
  },

  /* ── CRÉDITO Y COBRANZA ────────────────────────────────────────────────── */
  'GET /credito/creditos': {
    rutaFrontend: '/dashboard/creditos/creditos',
    titulo: 'Créditos',
    modulo: 'credito',
    ordenMenu: 50,
  },
  'GET /credito/cobranza/pagos/:creditoId': {
    rutaFrontend: '/dashboard/creditos/cobranza',
    titulo: 'Cobranza',
    modulo: 'credito',
    ordenMenu: 51,
  },
  'GET /credito/creditos/cartera-vencida': {
    rutaFrontend: '/dashboard/creditos/cartera-vencida',
    titulo: 'Cartera vencida',
    modulo: 'credito',
    ordenMenu: 52,
  },
  'GET /credito/cuentas-bancarias': {
    rutaFrontend: '/dashboard/creditos/cuentas-bancarias',
    titulo: 'Cuentas bancarias',
    modulo: 'credito',
    ordenMenu: 53,
  },

  /* ── TESORERÍA (nuevo) ─────────────────────────────────────────────────── */
  'GET /tesoreria/movimientos': {
    rutaFrontend: '/dashboard/tesoreria/movimientos',
    titulo: 'Movimientos bancarios',
    modulo: 'tesoreria',
    ordenMenu: 55,
  },
  'GET /tesoreria/conciliacion': {
    rutaFrontend: '/dashboard/tesoreria/conciliacion',
    titulo: 'Conciliación bancaria',
    modulo: 'tesoreria',
    ordenMenu: 56,
  },
  'GET /tesoreria/flujo-efectivo': {
    rutaFrontend: '/dashboard/tesoreria/flujo',
    titulo: 'Flujo de efectivo',
    modulo: 'tesoreria',
    ordenMenu: 57,
  },

  /* ── ACTIVOS FIJOS (nuevo) ─────────────────────────────────────────────── */
  'GET /activos': {
    rutaFrontend: '/dashboard/activos/registro',
    titulo: 'Registro de activos',
    modulo: 'activos',
    ordenMenu: 60,
  },
  'POST /activos/depreciacion/corrida': {
    rutaFrontend: '/dashboard/activos/depreciacion',
    titulo: 'Corrida de depreciación',
    modulo: 'activos',
    ordenMenu: 61,
  },
  'POST /activos/:id/baja': {
    rutaFrontend: '/dashboard/activos/bajas',
    titulo: 'Bajas y ventas',
    modulo: 'activos',
    ordenMenu: 62,
  },
  'GET /activos/reportes/cedula': {
    rutaFrontend: '/dashboard/activos/cedula',
    titulo: 'Cédula de depreciación',
    modulo: 'activos',
    ordenMenu: 63,
  },

  /* ── RECURSOS HUMANOS (nuevo) ──────────────────────────────────────────── */
  'GET /rrhh/empleados': {
    rutaFrontend: '/dashboard/rrhh/empleados',
    titulo: 'Empleados',
    modulo: 'rrhh',
    ordenMenu: 70,
  },
  'GET /rrhh/puestos': {
    rutaFrontend: '/dashboard/rrhh/puestos',
    titulo: 'Puestos y salarios',
    modulo: 'rrhh',
    ordenMenu: 71,
  },
  'GET /rrhh/asistencia': {
    rutaFrontend: '/dashboard/rrhh/asistencia',
    titulo: 'Asistencia',
    modulo: 'rrhh',
    ordenMenu: 72,
  },
  'GET /rrhh/incidencias': {
    rutaFrontend: '/dashboard/rrhh/incidencias',
    titulo: 'Incidencias',
    modulo: 'rrhh',
    ordenMenu: 73,
  },
  'GET /rrhh/nomina/periodos': {
    rutaFrontend: '/dashboard/rrhh/nomina',
    titulo: 'Periodos de nómina',
    modulo: 'rrhh',
    ordenMenu: 74,
  },
  'GET /rrhh/nomina/recibos': {
    rutaFrontend: '/dashboard/rrhh/recibos',
    titulo: 'Recibos',
    modulo: 'rrhh',
    ordenMenu: 75,
  },

  /* ── CRM (nuevo) ───────────────────────────────────────────────────────── */
  'GET /crm/pipeline': {
    rutaFrontend: '/dashboard/crm/pipeline',
    titulo: 'Pipeline',
    modulo: 'crm',
    ordenMenu: 80,
  },
  'GET /crm/oportunidades': {
    rutaFrontend: '/dashboard/crm/oportunidades',
    titulo: 'Oportunidades',
    modulo: 'crm',
    ordenMenu: 81,
  },
  'GET /crm/actividades': {
    rutaFrontend: '/dashboard/crm/actividades',
    titulo: 'Actividades',
    modulo: 'crm',
    ordenMenu: 82,
  },

  /* ── REPORTES ──────────────────────────────────────────────────────────── */
  'GET /ventas/dashboard/ejecutivo': {
    rutaFrontend: '/dashboard/reportes/ejecutivo',
    titulo: 'Panel ejecutivo',
    modulo: 'reportes',
    ordenMenu: 90,
  },
  'GET /ventas/reportes/ventas': {
    rutaFrontend: '/dashboard/reportes/ventas',
    titulo: 'Reporte de ventas',
    modulo: 'reportes',
    ordenMenu: 91,
  },
  'GET /ventas/reportes/top-productos': {
    rutaFrontend: '/dashboard/reportes/top-productos',
    titulo: 'Top de productos',
    modulo: 'reportes',
    ordenMenu: 92,
  },
  'GET /catalogo/reportes/inventario': {
    rutaFrontend: '/dashboard/reportes/inventario',
    titulo: 'Reporte de inventario',
    modulo: 'reportes',
    ordenMenu: 93,
  },
  'GET /ventas/reportes/corte-caja': {
    rutaFrontend: '/dashboard/reportes/corte-caja',
    titulo: 'Corte de caja',
    modulo: 'reportes',
    ordenMenu: 94,
  },
  'GET /credito/reportes/estado-cuenta': {
    rutaFrontend: '/dashboard/reportes/estado-cuenta',
    titulo: 'Estado de cuenta',
    modulo: 'reportes',
    ordenMenu: 95,
  },

  /* ── HOTELERÍA ─────────────────────────────────────────────────────────── */
  'GET /hoteleria/housekeeping/rack': {
    rutaFrontend: '/dashboard/hoteleria/rack',
    titulo: 'Rack de habitaciones',
    modulo: 'hoteleria',
    ordenMenu: 100,
  },
  'GET /hoteleria/operacion/reservaciones': {
    rutaFrontend: '/dashboard/hoteleria/reservaciones',
    titulo: 'Reservaciones',
    modulo: 'hoteleria',
    ordenMenu: 101,
  },
  'POST /hoteleria/operacion/auditoria-nocturna': {
    rutaFrontend: '/dashboard/hoteleria/auditoria',
    titulo: 'Auditoría nocturna',
    modulo: 'hoteleria',
    ordenMenu: 102,
  },
  'GET /hoteleria/housekeeping/tareas': {
    rutaFrontend: '/dashboard/hoteleria/housekeeping',
    titulo: 'Housekeeping',
    modulo: 'hoteleria',
    ordenMenu: 103,
  },
  'GET /recetas': {
    rutaFrontend: '/dashboard/hoteleria/recetas',
    titulo: 'Recetas y escandallos',
    modulo: 'hoteleria',
    ordenMenu: 104,
  },
  'GET /hoteleria/configuracion/habitaciones': {
    rutaFrontend: '/dashboard/hoteleria/configuracion',
    titulo: 'Configuración de hotel',
    modulo: 'hoteleria',
    ordenMenu: 105,
  },

  /* ── ADMINISTRACIÓN ────────────────────────────────────────────────────── */
  'GET /usuarios': {
    rutaFrontend: '/dashboard/usuarios',
    titulo: 'Usuarios',
    modulo: 'admin',
    ordenMenu: 110,
  },
  'GET /admin/permisos/arbol': {
    rutaFrontend: '/dashboard/permisos',
    titulo: 'Roles y permisos',
    modulo: 'admin',
    ordenMenu: 111,
  },
  'GET /departamentos': {
    rutaFrontend: '/dashboard/departamentos',
    titulo: 'Departamentos',
    modulo: 'admin',
    ordenMenu: 112,
  },
  'GET /auditoria': {
    rutaFrontend: '/dashboard/auditoria',
    titulo: 'Bitácora de auditoría',
    modulo: 'admin',
    ordenMenu: 113,
  },
  'POST /rpa/curp/consultar': {
    rutaFrontend: '/dashboard/rpa/curp',
    titulo: 'Consulta de CURP',
    modulo: 'admin',
    ordenMenu: 114,
  },
};

/** Todas las rutas de pantalla conocidas: sirve para validar el mapa. */
export const RUTAS_FRONTEND_CONOCIDAS = Array.from(
  new Set(Object.values(ENDPOINTS_NAVEGABLES).map((e) => e.rutaFrontend)),
);
