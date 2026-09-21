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
  /**
   * Otras pantallas que esta misma acción habilita.
   *
   * Existe para un caso concreto: la caja se mudó a `/pos`, fuera del área de
   * trabajo, y la dirección vieja `/dashboard/ventas/pos` se quedó como página
   * que redirige, para quien la tenga en favoritos. Las dos las habilita la
   * misma acción —poder registrar una venta—, y sin esto la vieja quedaba fuera
   * del perfil justo de la gente que tiene el favorito.
   */
  rutasAdicionales?: string[];
}

export const ENDPOINTS_NAVEGABLES: Record<string, EndpointNavMeta> = {
  /* ── VENTAS ────────────────────────────────────────────────────────────── */
  'GET /ventas': {
    rutaFrontend: '/dashboard/ventas/historial',
    titulo: 'Historial de ventas',
    modulo: 'ventas',
    ordenMenu: 2,
  },
  'POST /ventas': {
    // La caja es `/pos`; `/dashboard/ventas/pos` sólo redirige a ella.
    rutaFrontend: '/pos',
    rutasAdicionales: ['/dashboard/ventas/pos'],
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
  'GET /compras/cotizaciones/requisicion/:id': {
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
  'GET /aprobaciones/pendientes': {
    rutaFrontend: '/dashboard/aprobaciones',
    titulo: 'Bandeja central de aprobaciones',
    modulo: 'aprobaciones',
    ordenMenu: 8,
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
  'GET /configuraciones-aprobacion/matriz/todos': {
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
  'GET /catalogo/productos/atributos/:sector': {
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
  'GET /catalogo/importacion/stock-inicial': {
    rutaFrontend: '/dashboard/inventario/stock-inicial',
    titulo: 'Stock inicial',
    modulo: 'inventario',
    ordenMenu: 28,
  },
  'POST /catalogo/importacion/productos': {
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
  'GET /finanzas/cierres': {
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
  'PATCH /catalogo/categorias/:id/cuentas': {
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
  'GET /tesoreria/conciliacion/:estadoCuentaId/reporte': {
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
  'PATCH /activos/:id/baja': {
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
  'GET /rrhh/empleados/:id/contratos': {
    rutaFrontend: '/dashboard/rrhh/contratos',
    titulo: 'Contratos laborales',
    modulo: 'rrhh',
    ordenMenu: 72,
  },
  'GET /rrhh/empleados/:id/movimientos': {
    rutaFrontend: '/dashboard/rrhh/contratos',
    titulo: 'Historial laboral',
    modulo: 'rrhh',
    ordenMenu: 72,
  },
  'POST /rrhh/contratos': {
    rutaFrontend: '/dashboard/rrhh/contratos',
    titulo: 'Crear contrato laboral',
    modulo: 'rrhh',
    ordenMenu: 72,
  },
  'GET /rrhh/empleados/:id/finiquito': {
    rutaFrontend: '/dashboard/rrhh/bajas',
    titulo: 'Bajas y finiquitos',
    modulo: 'rrhh',
    ordenMenu: 73,
  },
  'PATCH /rrhh/empleados/:id/baja': {
    rutaFrontend: '/dashboard/rrhh/bajas',
    titulo: 'Registrar baja laboral',
    modulo: 'rrhh',
    ordenMenu: 73,
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
  'GET /dashboard/ejecutivo': {
    rutaFrontend: '/dashboard/reportes/ejecutivo',
    titulo: 'Panel ejecutivo',
    modulo: 'reportes',
    ordenMenu: 90,
  },
  'GET /ventas/dashboard/metricas': {
    rutaFrontend: '/dashboard/reportes/ventas',
    titulo: 'Reporte de ventas',
    modulo: 'reportes',
    ordenMenu: 91,
  },
  'GET /ventas/dashboard/top-productos': {
    rutaFrontend: '/dashboard/reportes/top-productos',
    titulo: 'Top de productos',
    modulo: 'reportes',
    ordenMenu: 92,
  },
  'GET /catalogo/inventario/stock': {
    rutaFrontend: '/dashboard/reportes/inventario',
    titulo: 'Reporte de inventario',
    modulo: 'reportes',
    ordenMenu: 93,
  },
  'GET /caja/turnos': {
    rutaFrontend: '/dashboard/reportes/corte-caja',
    titulo: 'Corte de caja',
    modulo: 'reportes',
    ordenMenu: 94,
  },
  'GET /credito/estado-cuenta/:clienteId': {
    rutaFrontend: '/dashboard/reportes/estado-cuenta',
    titulo: 'Estado de cuenta',
    modulo: 'reportes',
    ordenMenu: 95,
  },

  /* ── HOTELERÍA ─────────────────────────────────────────────────────────── */
  /*
   * Misma historia que el índice de reportes: `/dashboard/hoteleria` es padre
   * de `/dashboard/hoteleria/recetas` y `/costos-recetas`, que son del módulo
   * de Recetas y producción. Conceder el panel regalaba el escandallo y el
   * costo teórico contra real a cualquiera con hotelería en consulta —cobranza
   * los tenía—. El panel es el rack.
   */
  'GET /hoteleria/operacion/panel': {
    rutaFrontend: '/dashboard/hoteleria/rack',
    titulo: 'Panel hotelero',
    modulo: 'hoteleria',
    ordenMenu: 99,
  },
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
  'GET /hoteleria/auditoria/estado': {
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
  'GET /hoteleria/operacion/reservaciones/:id/folio': {
    rutaFrontend: '/dashboard/hoteleria/folios',
    titulo: 'Folios y check-out',
    modulo: 'hoteleria',
    ordenMenu: 104,
  },
  'GET /hoteleria/city-ledger/cartera': {
    rutaFrontend: '/dashboard/hoteleria/city-ledger',
    titulo: 'City Ledger y cobranza',
    modulo: 'hoteleria',
    ordenMenu: 105,
  },
  'GET /recetas': {
    rutaFrontend: '/dashboard/hoteleria/recetas',
    titulo: 'Recetas y escandallos',
    modulo: 'hoteleria',
    ordenMenu: 106,
  },
  'GET /recetas/costos/teorico-vs-real': {
    rutaFrontend: '/dashboard/hoteleria/costos-recetas',
    titulo: 'Costos de recetas',
    modulo: 'hoteleria',
    ordenMenu: 107,
  },
  'GET /hoteleria/config/hoteles': {
    rutaFrontend: '/dashboard/hoteleria/configuracion',
    titulo: 'Configuración de hotel',
    modulo: 'hoteleria',
    ordenMenu: 108,
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

  /* ── AÑADIDAS: pantallas del menú que no tenían endpoint navegable ────── */
  'GET /configuracion/diagnostico': {
    rutaFrontend: '/dashboard/configuracion/centro',
    titulo: 'Centro de configuración',
    modulo: 'configuracion',
    ordenMenu: 1,
  },
  'GET /configuracion/integridad': {
    rutaFrontend: '/dashboard/configuracion/integridad',
    titulo: 'Integridad de datos',
    modulo: 'configuracion',
    ordenMenu: 2,
  },
  'GET /configuracion/esquema': {
    rutaFrontend: '/dashboard/configuracion/esquema',
    titulo: 'Compatibilidad de BD',
    modulo: 'configuracion',
    ordenMenu: 3,
  },
  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Los seis asistentes de puesta en marcha, en una sola acción
   * --------------------------------------------------------------------------
   * Cada asistente colgaba de la acción del dueño del dato de fondo: quien
   * podía crear almacenes veía el wizard de inventario, quien podía dar de alta
   * proveedores veía el de compras, y quien podía bajar la plantilla de
   * importación veía «Importación inicial». La idea era razonable y el efecto
   * no: al almacenista le aparecía un cuadro de «Configuración» con asistentes
   * de arranque de la empresa, y en la lista de primeros pasos, renglones
   * fiscales que no puede ni entender ni capturar. Quien acomoda mercancía no
   * configura el régimen fiscal ni activa los libros contables.
   *
   * Los asistentes son de puesta en marcha: se corren una vez, al abrir la
   * empresa, y son trabajo de quien administra el sistema. Por eso cuelgan de
   * una acción de `/configuracion`, que pertenece al módulo «Administración del
   * sistema» y no está en ninguna plantilla: sólo el administrador.
   * ──────────────────────────────────────────────────────────────────────────
   */
  'GET /configuracion/empresa': {
    rutaFrontend: '/dashboard/configuracion/centro',
    rutasAdicionales: [
      '/dashboard/configuracion/wizard-ventas',
      '/dashboard/configuracion/wizard-compras',
      '/dashboard/configuracion/wizard-inventario',
      '/dashboard/configuracion/wizard-credito',
      '/dashboard/configuracion/wizard-finanzas',
      '/dashboard/configuracion/wizard-importacion',
    ],
    titulo: 'Asistentes de puesta en marcha',
    modulo: 'configuracion',
    ordenMenu: 5,
  },
  'GET /configuracion/pendientes': {
    rutaFrontend: '/dashboard/operaciones/pendientes',
    titulo: 'Operaciones pendientes',
    modulo: 'configuracion',
    ordenMenu: 4,
  },
  'GET /finanzas/activacion/acceso': {
    rutaFrontend: '/configuracion-financiera',
    titulo: 'Asistente maestro financiero',
    modulo: 'finanzas',
    ordenMenu: 11,
  },
  'GET /finanzas/asientos-pendientes': {
    rutaFrontend: '/dashboard/finanzas/asientos-pendientes',
    titulo: 'Asientos pendientes',
    modulo: 'finanzas',
    ordenMenu: 59,
  },
  'GET /finanzas/catalogos-sat/resumen': {
    rutaFrontend: '/dashboard/finanzas/catalogos-sat',
    titulo: 'Clasificación SAT',
    modulo: 'finanzas',
    ordenMenu: 57,
  },
  'GET /finanzas/conciliacion-inicial': {
    rutaFrontend: '/dashboard/finanzas/conciliacion-inicial',
    titulo: 'Conciliación inicial',
    modulo: 'finanzas',
    ordenMenu: 60,
  },
  'GET /finanzas/integridad/diagnostico': {
    rutaFrontend: '/dashboard/finanzas/integridad',
    titulo: 'Integridad financiera',
    modulo: 'finanzas',
    ordenMenu: 61,
  },
  'GET /catalogo/wms/integridad-ubicaciones': {
    rutaFrontend: '/dashboard/almacenes/centro',
    titulo: 'Centro de operaciones de almacén',
    modulo: 'almacenes',
    ordenMenu: 20,
  },
  'GET /catalogo/wms/stock-ubicaciones': {
    rutaFrontend: '/dashboard/almacenes/existencias',
    titulo: 'Existencias y posiciones',
    modulo: 'almacenes',
    ordenMenu: 21,
  },
  'GET /catalogo/wms/conteos': {
    rutaFrontend: '/dashboard/inventario/conteos',
    titulo: 'Conteos físicos',
    modulo: 'almacenes',
    ordenMenu: 22,
  },
  'GET /catalogo/wms/ubicaciones': {
    rutaFrontend: '/dashboard/inventario/ubicaciones',
    titulo: 'Ubicaciones',
    modulo: 'almacenes',
    ordenMenu: 23,
  },
  'POST /catalogo/wms/reubicaciones': {
    rutaFrontend: '/dashboard/inventario/reubicaciones',
    titulo: 'Reubicaciones',
    modulo: 'almacenes',
    ordenMenu: 24,
  },
  'GET /rrhh/nomina-avanzada/tablero': {
    rutaFrontend: '/dashboard/rrhh/centro-nomina',
    titulo: 'Centro integral de nómina',
    modulo: 'rrhh',
    ordenMenu: 70,
  },
  'GET /rrhh/conceptos': {
    rutaFrontend: '/dashboard/rrhh/conceptos-nomina',
    titulo: 'Conceptos y asignaciones',
    modulo: 'rrhh',
    ordenMenu: 71,
  },
  'GET /rrhh/nomina-avanzada/configuracion': {
    rutaFrontend: '/dashboard/rrhh/configuracion-nomina',
    titulo: 'Configuración patronal',
    modulo: 'rrhh',
    ordenMenu: 72,
  },
  'GET /rrhh/nomina-avanzada/cuentas-bancarias': {
    rutaFrontend: '/dashboard/rrhh/cuentas-bancarias',
    titulo: 'Cuentas bancarias de empleados',
    modulo: 'rrhh',
    ordenMenu: 73,
  },
  'GET /rrhh/nomina-avanzada/prestamos': {
    rutaFrontend: '/dashboard/rrhh/prestamos',
    titulo: 'Préstamos y descuentos',
    modulo: 'rrhh',
    ordenMenu: 74,
  },
  'GET /rrhh/vacaciones/solicitudes': {
    rutaFrontend: '/dashboard/rrhh/vacaciones',
    titulo: 'Vacaciones y saldos',
    modulo: 'rrhh',
    ordenMenu: 75,
  },
  'POST /rrhh/nomina-avanzada/periodos/:id/pago': {
    rutaFrontend: '/dashboard/rrhh/pagos',
    titulo: 'Dispersión y pagos',
    modulo: 'rrhh',
    ordenMenu: 76,
  },
  'GET /rrhh/nomina-avanzada/periodos/:id/cumplimiento': {
    rutaFrontend: '/dashboard/rrhh/cumplimiento',
    titulo: 'Cumplimiento y cierre',
    modulo: 'rrhh',
    ordenMenu: 77,
  },
  'GET /rrhh/estructura/solicitudes': {
    rutaFrontend: '/dashboard/rrhh/aprobaciones-estructura',
    titulo: 'Aprobaciones de estructura',
    modulo: 'rrhh',
    ordenMenu: 78,
  },
  'GET /caja/turnos/abiertos': {
    rutaFrontend: '/dashboard/tesoreria/caja',
    titulo: 'Caja, corte y arqueo',
    modulo: 'tesoreria',
    ordenMenu: 40,
  },
  'GET /ventas/devoluciones': {
    rutaFrontend: '/dashboard/ventas/devoluciones',
    titulo: 'Devoluciones de venta',
    modulo: 'ventas',
    ordenMenu: 4,
  },
  /*
   * Iba a `/dashboard/reportes` —el índice— y eso no era un renglón de menú
   * más: los permisos de pantalla cubren la ruta Y SUS DESCENDIENTES, así que
   * conceder el índice concedía el árbol entero. Quien tuviera esta acción,
   * que es la métrica del catálogo de productos, entraba también al panel
   * ejecutivo, al corte de caja y al estado de cuenta de los clientes. Lo
   * tenían el almacenista, el comprador y hotelería.
   *
   * Ahora apunta a la pantalla que de verdad abre. El índice de reportes es un
   * contenedor, como los centros de trabajo, y se resuelve en el layout: se
   * entra si se puede abrir al menos un reporte de dentro.
   */
  /*
   * El espejo contable existía y no lo habilitaba ninguna acción: sólo lo veía
   * el administrador, y no por decisión sino por omisión —el administrador se
   * salta la tabla de permisos entera—. Es la pantalla donde se ve qué cuentas
   * no tienen equivalencia en el core y qué pólizas no llegaron; si el contador
   * no entra, nadie mira eso hasta que la balanza no cuadra contra Fineract.
   */
  'GET /integracion/cuentas/pendientes': {
    rutaFrontend: '/dashboard/finanzas/espejo-contable',
    titulo: 'Espejo contable',
    modulo: 'finanzas',
    ordenMenu: 47,
  },

  'GET /catalogo/productos/dashboard/metricas': {
    rutaFrontend: '/dashboard/reportes/inventario',
    titulo: 'Reporte de inventario',
    modulo: 'reportes',
    ordenMenu: 80,
  },

  /* ── CRÉDITO · pantallas que no habilitaba ninguna acción ─────────────────
   * Las tres existían en el menú y ninguna acción las concedía, así que sólo
   * las veía un administrador —y no por decisión, sino por omisión: el
   * administrador salta la tabla de permisos entera—. Lo detectó
   * `coherencia.spec.ts` en cuanto dejó de fallar por un separador de ruta.
   */
  'GET /credito/productos': {
    rutaFrontend: '/dashboard/creditos/productos',
    titulo: 'Productos de crédito',
    modulo: 'credito',
    ordenMenu: 30,
  },
  'GET /integracion/validacion/flujos': {
    rutaFrontend: '/dashboard/creditos/verificacion',
    titulo: 'Verificación de crédito',
    modulo: 'credito',
    ordenMenu: 31,
  },
  'GET /integracion/avisos': {
    rutaFrontend: '/dashboard/creditos/avisos',
    titulo: 'Avisos del core',
    modulo: 'integracion',
    ordenMenu: 32,
  },
};

/** Todas las rutas de pantalla conocidas: sirve para validar el mapa. */
export const RUTAS_FRONTEND_CONOCIDAS = Array.from(
  new Set(Object.values(ENDPOINTS_NAVEGABLES).map((e) => e.rutaFrontend)),
);
