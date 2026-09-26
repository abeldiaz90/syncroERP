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
  ordenMenu: number;
  /*
   * AQUI HABIA UN CAMPO `modulo: string`. Se elimino el 21-sep-2026.
   *
   * Nadie lo leia —ni el servicio de permisos, ni las pruebas, ni el
   * frontend— y significaba DOS cosas distintas segun la entrada: en
   * `GET /ventas/dashboard/metricas` decia 'reportes', que es donde se ve la
   * pantalla; en `GET /catalogo/almacenes` decia 'almacenes', que pretendia
   * ser de que modulo es el permiso. Estaba tipado como `string` libre, asi
   * que nada obligaba a que el modulo nombrado existiera.
   *
   * De las 115 entradas, 29 contradecian a `moduloDeRuta()`, que es quien
   * decide de verdad. Y tres de los nombres usados —'almacenes', 'admin',
   * 'configuracion'— no existian en el catalogo de modulos: eran etiquetas de
   * menu disfrazadas de modulos de permiso. Ese disfraz es lo que dejo a
   * «Almacenes» existiendo en el menu y no en los permisos, de modo que
   * conceder «inventario» entregaba el almacen entero y
   * `modulosVedados: ['almacenes']` no habria hecho nada.
   *
   * Un dato duplicado que nadie consulta solo puede divergir. De que modulo es
   * una ruta lo responde `moduloDeRuta()`, y donde se ve una pantalla lo
   * responde `module-config.ts`. Dos preguntas, dos fuentes, ninguna copia.
   */
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
    /*
     * El ticket cuelga de `/dashboard/ventas/<id>`, que es HERMANO del
     * historial, no hijo: sin declararlo aquí no lo cubría ningún permiso y
     * la pantalla decía «esta sección no está en tu perfil» a los diez roles,
     * aunque `GET /ventas/:id` contestara 200 a todos. Quien puede ver la
     * lista de ventas puede ver el comprobante de una de ellas.
     */
    rutasAdicionales: ['/dashboard/ventas/:id/ticket'],
    ordenMenu: 2,
  },
  'POST /ventas': {
    // La caja es `/pos`; `/dashboard/ventas/pos` sólo redirige a ella.
    rutaFrontend: '/pos',
    /*
     * Y el ticket también, porque el punto de venta redirige a él en cuanto
     * se cobra: quien cobra tiene que poder imprimir lo que acaba de cobrar,
     * tenga o no el historial completo.
     */
    rutasAdicionales: ['/dashboard/ventas/pos', '/dashboard/ventas/:id/ticket'],
    titulo: 'Punto de venta',
    ordenMenu: 1,
  },
  /*
   * Facturar es la otra pantalla que cuelga de una venta concreta. No la
   * abre quien vende: la abre quien puede timbrar.
   */
  'POST /cfdi/ventas/:id/timbrar': {
    rutaFrontend: '/dashboard/ventas/:id/facturar',
    titulo: 'Facturar venta',
    ordenMenu: 3,
  },

  /* ── COMPRAS ───────────────────────────────────────────────────────────── */
  'GET /compras/requisiciones': {
    rutaFrontend: '/dashboard/compras/requisiciones',
    titulo: 'Requisiciones',
    ordenMenu: 10,
  },
  'GET /compras/cotizaciones/requisicion/:id': {
    rutaFrontend: '/dashboard/compras/cotizaciones',
    titulo: 'Cotizaciones',
    ordenMenu: 11,
  },
  'GET /compras/requisiciones/aprobaciones/pendientes': {
    rutaFrontend: '/dashboard/compras/aprobaciones',
    titulo: 'Aprobaciones',
    ordenMenu: 12,
  },
  'GET /aprobaciones/pendientes': {
    rutaFrontend: '/dashboard/aprobaciones',
    titulo: 'Bandeja central de aprobaciones',
    ordenMenu: 8,
  },
  'GET /compras/ordenes': {
    rutaFrontend: '/dashboard/compras/ordenes',
    titulo: 'Órdenes de compra',
    ordenMenu: 13,
  },
  'GET /compras/ordenes/recepciones': {
    rutaFrontend: '/dashboard/inventario/recepciones',
    titulo: 'Recepciones',
    ordenMenu: 14,
  },
  'PATCH /compras/ordenes/:id/pagar': {
    rutaFrontend: '/dashboard/compras/pago-proveedores',
    titulo: 'Pago a proveedores',
    ordenMenu: 15,
  },
  'GET /configuraciones-aprobacion/matriz/todos': {
    rutaFrontend: '/dashboard/configuraciones-aprobacion',
    titulo: 'Flujos de aprobación',
    ordenMenu: 16,
  },

  /* ── INVENTARIO ────────────────────────────────────────────────────────── */
  'GET /catalogo/productos': {
    rutaFrontend: '/dashboard/productos',
    titulo: 'Productos',
    ordenMenu: 20,
  },
  'GET /catalogo/productos/atributos/:sector': {
    rutaFrontend: '/dashboard/productos/atributos',
    titulo: 'Atributos y variantes',
    ordenMenu: 21,
  },
  'GET /catalogo/categorias': {
    rutaFrontend: '/dashboard/categorias',
    titulo: 'Categorías',
    ordenMenu: 22,
  },
  'GET /catalogo/marcas': {
    rutaFrontend: '/dashboard/marcas',
    titulo: 'Marcas',
    ordenMenu: 23,
  },
  'GET /catalogo/unidades-medida': {
    rutaFrontend: '/dashboard/unidades-medida',
    titulo: 'Unidades de medida',
    ordenMenu: 24,
  },
  'GET /catalogo/almacenes': {
    rutaFrontend: '/dashboard/almacenes',
    titulo: 'Almacenes',
    ordenMenu: 25,
  },
  'POST /catalogo/inventario/productos/transferir': {
    rutaFrontend: '/dashboard/inventario/transferencias',
    titulo: 'Transferencias',
    ordenMenu: 26,
  },
  'POST /catalogo/inventario/productos/ajuste': {
    rutaFrontend: '/dashboard/inventario/ajustes',
    titulo: 'Ajustes de stock',
    ordenMenu: 27,
  },
  'GET /catalogo/importacion/stock-inicial': {
    rutaFrontend: '/dashboard/inventario/stock-inicial',
    titulo: 'Stock inicial',
    ordenMenu: 28,
  },
  'POST /catalogo/importacion/productos': {
    rutaFrontend: '/dashboard/inventario/importar',
    titulo: 'Importar desde Excel',
    ordenMenu: 29,
  },

  /* ── CATÁLOGOS ─────────────────────────────────────────────────────────── */
  'GET /clientes': {
    rutaFrontend: '/dashboard/clientes',
    titulo: 'Clientes',
    ordenMenu: 30,
  },
  'GET /proveedores': {
    rutaFrontend: '/dashboard/proveedores',
    titulo: 'Proveedores',
    ordenMenu: 31,
  },
  'GET /catalogo/listas-precio': {
    rutaFrontend: '/dashboard/listas-precio',
    titulo: 'Listas de precio',
    ordenMenu: 32,
  },
  'GET /catalogo/impuestos': {
    rutaFrontend: '/dashboard/impuestos',
    titulo: 'Impuestos',
    ordenMenu: 33,
  },
  'GET /catalogos/formas-pago': {
    rutaFrontend: '/dashboard/catalogos/formas-pago',
    titulo: 'Formas de pago',
    ordenMenu: 34,
  },
  'GET /catalogos/bancos': {
    rutaFrontend: '/dashboard/catalogos/bancos',
    titulo: 'Bancos',
    ordenMenu: 35,
  },
  'GET /catalogos/paises': {
    rutaFrontend: '/dashboard/catalogos/paises',
    titulo: 'Países',
    ordenMenu: 36,
  },
  'GET /catalogos/estados': {
    rutaFrontend: '/dashboard/catalogos/estados',
    titulo: 'Estados',
    ordenMenu: 37,
  },

  /* ── FINANZAS ──────────────────────────────────────────────────────────── */
  'GET /finanzas/polizas': {
    rutaFrontend: '/dashboard/finanzas/polizas',
    titulo: 'Libro diario',
    ordenMenu: 40,
  },
  'POST /finanzas/polizas': {
    rutaFrontend: '/dashboard/finanzas/polizas/nueva',
    titulo: 'Nueva póliza',
    ordenMenu: 41,
  },
  'GET /finanzas/polizas/saldos-iniciales': {
    rutaFrontend: '/dashboard/finanzas/saldos-iniciales',
    titulo: 'Saldos iniciales',
    ordenMenu: 42,
  },
  'GET /finanzas/polizas/balanza': {
    rutaFrontend: '/dashboard/finanzas/balanza',
    titulo: 'Balanza de comprobación',
    ordenMenu: 43,
  },
  'GET /finanzas/polizas/resultado': {
    rutaFrontend: '/dashboard/finanzas/estado-resultados',
    titulo: 'Estado de resultados',
    ordenMenu: 44,
  },
  'GET /finanzas/polizas/balance': {
    rutaFrontend: '/dashboard/finanzas/balance-general',
    titulo: 'Balance general',
    ordenMenu: 45,
  },
  'GET /finanzas/polizas/iva': {
    rutaFrontend: '/dashboard/finanzas/declaracion-iva',
    titulo: 'Declaración de IVA',
    ordenMenu: 46,
  },
  'GET /finanzas/cierres': {
    rutaFrontend: '/dashboard/finanzas/cierre-contable',
    titulo: 'Cierre contable',
    ordenMenu: 47,
  },
  'GET /finanzas/cuentas-contables': {
    rutaFrontend: '/dashboard/finanzas/cuentas-contables',
    titulo: 'Catálogo de cuentas',
    ordenMenu: 48,
  },
  'PATCH /catalogo/categorias/:id/cuentas': {
    rutaFrontend: '/dashboard/finanzas/categorias-contables',
    titulo: 'Categorías contables',
    ordenMenu: 49,
  },

  /* ── CRÉDITO Y COBRANZA ────────────────────────────────────────────────── */
  'GET /credito/creditos': {
    rutaFrontend: '/dashboard/creditos/creditos',
    titulo: 'Créditos',
    ordenMenu: 50,
  },
  'GET /credito/cobranza/pagos/:creditoId': {
    rutaFrontend: '/dashboard/creditos/cobranza',
    titulo: 'Cobranza',
    ordenMenu: 51,
  },
  'GET /credito/creditos/cartera-vencida': {
    rutaFrontend: '/dashboard/creditos/cartera-vencida',
    titulo: 'Cartera vencida',
    ordenMenu: 52,
  },
  'GET /credito/cuentas-bancarias': {
    rutaFrontend: '/dashboard/creditos/cuentas-bancarias',
    titulo: 'Cuentas bancarias',
    ordenMenu: 53,
  },

  /* ── TESORERÍA (nuevo) ─────────────────────────────────────────────────── */
  'GET /tesoreria/movimientos': {
    rutaFrontend: '/dashboard/tesoreria/movimientos',
    titulo: 'Movimientos bancarios',
    ordenMenu: 55,
  },
  'GET /tesoreria/conciliacion/:estadoCuentaId/reporte': {
    rutaFrontend: '/dashboard/tesoreria/conciliacion',
    titulo: 'Conciliación bancaria',
    ordenMenu: 56,
  },
  'GET /tesoreria/flujo-efectivo': {
    rutaFrontend: '/dashboard/tesoreria/flujo',
    titulo: 'Flujo de efectivo',
    ordenMenu: 57,
  },

  /* ── ACTIVOS FIJOS (nuevo) ─────────────────────────────────────────────── */
  'GET /activos': {
    rutaFrontend: '/dashboard/activos/registro',
    titulo: 'Registro de activos',
    ordenMenu: 60,
  },
  'POST /activos/depreciacion/corrida': {
    rutaFrontend: '/dashboard/activos/depreciacion',
    titulo: 'Corrida de depreciación',
    ordenMenu: 61,
  },
  'PATCH /activos/:id/baja': {
    rutaFrontend: '/dashboard/activos/bajas',
    titulo: 'Bajas y ventas',
    ordenMenu: 62,
  },
  'GET /activos/reportes/cedula': {
    rutaFrontend: '/dashboard/activos/cedula',
    titulo: 'Cédula de depreciación',
    ordenMenu: 63,
  },

  /* ── RECURSOS HUMANOS (nuevo) ──────────────────────────────────────────── */
  'GET /rrhh/empleados': {
    rutaFrontend: '/dashboard/rrhh/empleados',
    titulo: 'Empleados',
    ordenMenu: 70,
  },
  'GET /rrhh/puestos': {
    rutaFrontend: '/dashboard/rrhh/puestos',
    titulo: 'Puestos y salarios',
    ordenMenu: 71,
  },
  'GET /rrhh/empleados/:id/contratos': {
    rutaFrontend: '/dashboard/rrhh/contratos',
    titulo: 'Contratos laborales',
    ordenMenu: 72,
  },
  'GET /rrhh/empleados/:id/movimientos': {
    rutaFrontend: '/dashboard/rrhh/contratos',
    titulo: 'Historial laboral',
    ordenMenu: 72,
  },
  'POST /rrhh/contratos': {
    rutaFrontend: '/dashboard/rrhh/contratos',
    titulo: 'Crear contrato laboral',
    ordenMenu: 72,
  },
  'GET /rrhh/empleados/:id/finiquito': {
    rutaFrontend: '/dashboard/rrhh/bajas',
    titulo: 'Bajas y finiquitos',
    ordenMenu: 73,
  },
  'PATCH /rrhh/empleados/:id/baja': {
    rutaFrontend: '/dashboard/rrhh/bajas',
    titulo: 'Registrar baja laboral',
    ordenMenu: 73,
  },
  'GET /rrhh/asistencia': {
    rutaFrontend: '/dashboard/rrhh/asistencia',
    titulo: 'Asistencia',
    ordenMenu: 72,
  },
  'GET /rrhh/incidencias': {
    rutaFrontend: '/dashboard/rrhh/incidencias',
    titulo: 'Incidencias',
    ordenMenu: 73,
  },
  'GET /rrhh/nomina/periodos': {
    rutaFrontend: '/dashboard/rrhh/nomina',
    titulo: 'Periodos de nómina',
    ordenMenu: 74,
  },
  'GET /rrhh/nomina/recibos': {
    rutaFrontend: '/dashboard/rrhh/recibos',
    titulo: 'Recibos',
    ordenMenu: 75,
  },

  /* ── CRM (nuevo) ───────────────────────────────────────────────────────── */
  'GET /crm/pipeline': {
    rutaFrontend: '/dashboard/crm/pipeline',
    titulo: 'Pipeline',
    ordenMenu: 80,
  },
  'GET /crm/oportunidades': {
    rutaFrontend: '/dashboard/crm/oportunidades',
    titulo: 'Oportunidades',
    ordenMenu: 81,
  },
  'GET /crm/actividades': {
    rutaFrontend: '/dashboard/crm/actividades',
    titulo: 'Actividades',
    ordenMenu: 82,
  },

  /* ── REPORTES ──────────────────────────────────────────────────────────── */
  'GET /dashboard/ejecutivo': {
    rutaFrontend: '/dashboard/reportes/ejecutivo',
    titulo: 'Panel ejecutivo',
    ordenMenu: 90,
  },
  'GET /ventas/dashboard/metricas': {
    rutaFrontend: '/dashboard/reportes/ventas',
    titulo: 'Reporte de ventas',
    ordenMenu: 91,
  },
  'GET /ventas/dashboard/top-productos': {
    rutaFrontend: '/dashboard/reportes/top-productos',
    titulo: 'Top de productos',
    ordenMenu: 92,
  },
  'GET /catalogo/inventario/stock': {
    rutaFrontend: '/dashboard/reportes/inventario',
    titulo: 'Reporte de inventario',
    ordenMenu: 93,
  },
  'GET /caja/turnos': {
    rutaFrontend: '/dashboard/reportes/corte-caja',
    titulo: 'Corte de caja',
    ordenMenu: 94,
  },
  'GET /credito/estado-cuenta/:clienteId': {
    rutaFrontend: '/dashboard/reportes/estado-cuenta',
    titulo: 'Estado de cuenta',
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
    /*
     * El panel se mudó a su propia dirección. Estaba en `/dashboard/hoteleria`
     * —padre de Recetas— y por eso se le apuntaba al rack: conceder la portada
     * regalaba el escandallo. El efecto fue que la portada no la abría nadie
     * salvo el administrador, y el enlace «Panel» de Reservaciones llevaba a
     * «esta sección no está en tu perfil». `/dashboard/hoteleria/panel` no es
     * padre de nada, así que ya se puede conceder sola.
     */
    rutaFrontend: '/dashboard/hoteleria/panel',
    titulo: 'Panel hotelero',
    ordenMenu: 99,
  },
  'GET /hoteleria/housekeeping/rack': {
    rutaFrontend: '/dashboard/hoteleria/rack',
    titulo: 'Rack de habitaciones',
    ordenMenu: 100,
  },
  'GET /hoteleria/operacion/reservaciones': {
    rutaFrontend: '/dashboard/hoteleria/reservaciones',
    titulo: 'Reservaciones',
    ordenMenu: 101,
  },
  'GET /hoteleria/auditoria/estado': {
    rutaFrontend: '/dashboard/hoteleria/auditoria',
    titulo: 'Auditoría nocturna',
    ordenMenu: 102,
  },
  'GET /hoteleria/housekeeping/tareas': {
    rutaFrontend: '/dashboard/hoteleria/housekeeping',
    titulo: 'Housekeeping',
    ordenMenu: 103,
  },
  'GET /hoteleria/operacion/reservaciones/:id/folio': {
    rutaFrontend: '/dashboard/hoteleria/folios',
    titulo: 'Folios y check-out',
    ordenMenu: 104,
  },
  'GET /hoteleria/city-ledger/cartera': {
    rutaFrontend: '/dashboard/hoteleria/city-ledger',
    titulo: 'City Ledger y cobranza',
    ordenMenu: 105,
  },
  'GET /recetas': {
    rutaFrontend: '/dashboard/hoteleria/recetas',
    titulo: 'Recetas y escandallos',
    ordenMenu: 106,
  },
  'GET /recetas/costos/teorico-vs-real': {
    rutaFrontend: '/dashboard/hoteleria/costos-recetas',
    titulo: 'Costos de recetas',
    ordenMenu: 107,
  },
  'GET /hoteleria/config/hoteles': {
    rutaFrontend: '/dashboard/hoteleria/configuracion',
    titulo: 'Configuración de hotel',
    ordenMenu: 108,
  },

  /* ── ADMINISTRACIÓN ────────────────────────────────────────────────────── */
  'GET /usuarios': {
    rutaFrontend: '/dashboard/usuarios',
    titulo: 'Usuarios',
    ordenMenu: 110,
  },
  'GET /admin/permisos/arbol': {
    rutaFrontend: '/dashboard/permisos',
    titulo: 'Roles y permisos',
    ordenMenu: 111,
  },
  'GET /departamentos': {
    rutaFrontend: '/dashboard/departamentos',
    titulo: 'Departamentos',
    ordenMenu: 112,
  },
  'GET /auditoria': {
    rutaFrontend: '/dashboard/auditoria',
    titulo: 'Bitácora de auditoría',
    ordenMenu: 113,
  },
  'POST /rpa/curp/consultar': {
    rutaFrontend: '/dashboard/rpa/curp',
    titulo: 'Consulta de CURP',
    ordenMenu: 114,
  },

  /* ── AÑADIDAS: pantallas del menú que no tenían endpoint navegable ────── */
  'GET /configuracion/diagnostico': {
    rutaFrontend: '/dashboard/configuracion/centro',
    titulo: 'Centro de configuración',
    ordenMenu: 1,
  },
  'GET /configuracion/integridad': {
    rutaFrontend: '/dashboard/configuracion/integridad',
    titulo: 'Integridad de datos',
    ordenMenu: 2,
  },
  'GET /configuracion/esquema': {
    rutaFrontend: '/dashboard/configuracion/esquema',
    titulo: 'Compatibilidad de BD',
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
    ordenMenu: 5,
  },
  'GET /configuracion/pendientes': {
    rutaFrontend: '/dashboard/operaciones/pendientes',
    titulo: 'Operaciones pendientes',
    ordenMenu: 4,
  },
  /*
   * La puerta del asistente financiero la abria `GET /finanzas/activacion/
   * acceso`, que lleva `@SkipPermisos()`: no lo niega nadie, asi que la
   * pantalla quedaba en el perfil de TODOS los roles. Cobranza entraba y lo
   * primero que veia era «Tu perfil no incluye esta accion», porque lo que el
   * asistente consulta de verdad es `GET /finanzas/activacion`. Visto el
   * 25-sep-2026 con la sesion de cobranza.
   *
   * Una pantalla se abre con la llave que usa, no con una que todos tienen.
   */
  'GET /finanzas/activacion': {
    rutaFrontend: '/configuracion-financiera',
    titulo: 'Asistente maestro financiero',
    ordenMenu: 11,
  },
  /*
   * El panel fiscal del catálogo: qué producto lleva qué impuesto y si tiene
   * las claves del SAT. Es de Contabilidad, no del almacén.
   */
  'GET /catalogo/productos/fiscal': {
    rutaFrontend: '/dashboard/finanzas/fiscal-productos',
    titulo: 'Impuestos del catálogo',
    ordenMenu: 58,
  },
  'GET /finanzas/asientos-pendientes': {
    rutaFrontend: '/dashboard/finanzas/asientos-pendientes',
    titulo: 'Asientos pendientes',
    ordenMenu: 59,
  },
  'GET /finanzas/catalogos-sat/resumen': {
    rutaFrontend: '/dashboard/finanzas/catalogos-sat',
    titulo: 'Clasificación SAT',
    ordenMenu: 57,
  },
  'GET /finanzas/conciliacion-inicial': {
    rutaFrontend: '/dashboard/finanzas/conciliacion-inicial',
    titulo: 'Conciliación inicial',
    ordenMenu: 60,
  },
  'GET /finanzas/integridad/diagnostico': {
    rutaFrontend: '/dashboard/finanzas/integridad',
    titulo: 'Integridad financiera',
    ordenMenu: 61,
  },
  'GET /catalogo/wms/integridad-ubicaciones': {
    rutaFrontend: '/dashboard/almacenes/centro',
    titulo: 'Centro de operaciones de almacén',
    ordenMenu: 20,
  },
  'GET /catalogo/wms/stock-ubicaciones': {
    rutaFrontend: '/dashboard/almacenes/existencias',
    titulo: 'Existencias y posiciones',
    ordenMenu: 21,
  },
  'GET /catalogo/wms/conteos': {
    rutaFrontend: '/dashboard/inventario/conteos',
    titulo: 'Conteos físicos',
    ordenMenu: 22,
  },
  'GET /catalogo/wms/ubicaciones': {
    rutaFrontend: '/dashboard/inventario/ubicaciones',
    titulo: 'Ubicaciones',
    ordenMenu: 23,
  },
  'POST /catalogo/wms/reubicaciones': {
    rutaFrontend: '/dashboard/inventario/reubicaciones',
    titulo: 'Reubicaciones',
    ordenMenu: 24,
  },
  'GET /rrhh/nomina-avanzada/tablero': {
    rutaFrontend: '/dashboard/rrhh/centro-nomina',
    titulo: 'Centro integral de nómina',
    ordenMenu: 70,
  },
  'GET /rrhh/conceptos': {
    rutaFrontend: '/dashboard/rrhh/conceptos-nomina',
    titulo: 'Conceptos y asignaciones',
    ordenMenu: 71,
  },
  'GET /rrhh/nomina-avanzada/configuracion': {
    rutaFrontend: '/dashboard/rrhh/configuracion-nomina',
    titulo: 'Configuración patronal',
    ordenMenu: 72,
  },
  'GET /rrhh/nomina-avanzada/cuentas-bancarias': {
    rutaFrontend: '/dashboard/rrhh/cuentas-bancarias',
    titulo: 'Cuentas bancarias de empleados',
    ordenMenu: 73,
  },
  'GET /rrhh/nomina-avanzada/prestamos': {
    rutaFrontend: '/dashboard/rrhh/prestamos',
    titulo: 'Préstamos y descuentos',
    ordenMenu: 74,
  },
  'GET /rrhh/vacaciones/solicitudes': {
    rutaFrontend: '/dashboard/rrhh/vacaciones',
    titulo: 'Vacaciones y saldos',
    ordenMenu: 75,
  },
  /*
   * El enlace cuelga del pago, que es de Tesoreria, y la pantalla hace ahora
   * las dos mitades de su jornada: dispersar y pagar. Antes dispersar vivia en
   * «Cumplimiento y cierre», que no esta en su menu.
   */
  'POST /rrhh/nomina-avanzada/periodos/:id/pago': {
    rutaFrontend: '/dashboard/rrhh/pagos',
    titulo: 'Dispersión y pagos',
    ordenMenu: 76,
  },
  // Ya sin dispersion ni CFDI: queda el tablero del periodo y las dos acciones
  // de contabilidad, la poliza de devengo y el cierre definitivo.
  'GET /rrhh/nomina-avanzada/periodos/:id/cumplimiento': {
    rutaFrontend: '/dashboard/rrhh/cumplimiento',
    titulo: 'Cumplimiento y cierre',
    ordenMenu: 77,
  },
  'GET /rrhh/estructura/solicitudes': {
    rutaFrontend: '/dashboard/rrhh/aprobaciones-estructura',
    titulo: 'Aprobaciones de estructura',
    ordenMenu: 78,
  },
  'GET /caja/turnos/abiertos': {
    rutaFrontend: '/dashboard/tesoreria/caja',
    titulo: 'Caja, corte y arqueo',
    ordenMenu: 40,
  },
  'GET /ventas/devoluciones': {
    rutaFrontend: '/dashboard/ventas/devoluciones',
    titulo: 'Devoluciones de venta',
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
    ordenMenu: 47,
  },

  'GET /catalogo/productos/dashboard/metricas': {
    rutaFrontend: '/dashboard/reportes/inventario',
    titulo: 'Reporte de inventario',
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
    ordenMenu: 30,
  },
  /*
   * La llave es el TABLERO, no `flujos`.
   *
   * La pantalla es el control de verificaciones —cuántas se han corrido, qué
   * dijeron, y el botón para correr una más—, no el diseñador del flujo.
   * Colgarla de `GET /integracion/validacion/flujos`, que es administración
   * pura, se la ofrecía al rol equivocado y se la negaba al que la usa: a
   * `credito` le aparecía en el menú, entraba, y la pantalla contestaba «esta
   * operación es de administración» con los contadores en cero.
   */
  'GET /integracion/validacion/tablero': {
    rutaFrontend: '/dashboard/creditos/verificacion',
    titulo: 'Verificación de crédito',
    ordenMenu: 31,
  },
  'GET /integracion/avisos': {
    rutaFrontend: '/dashboard/creditos/avisos',
    titulo: 'Avisos del core',
    ordenMenu: 32,
  },
};

/** Todas las rutas de pantalla conocidas: sirve para validar el mapa. */
export const RUTAS_FRONTEND_CONOCIDAS = Array.from(
  new Set(Object.values(ENDPOINTS_NAVEGABLES).map((e) => e.rutaFrontend)),
);


/*
 * ============================================================================
 * El catalogo y este diccionario tienen que nombrar la misma ruta
 * ----------------------------------------------------------------------------
 * La sincronizacion guarda cada endpoint con TODOS sus parametros renombrados
 * a `:id` (`permisos-dinamicos.service.ts`), porque el guardia compara la ruta
 * de la peticion contra la fila y ahi los nombres no viajan. Este diccionario,
 * en cambio, se escribe con el nombre real del parametro, que es lo legible.
 *
 * La busqueda era por clave exacta, asi que las dos formas nunca se
 * encontraban: cualquier entrada cuyo parametro no se llamara `id` quedaba
 * MUDA. No fallaba: simplemente no hacia nada. El endpoint se daba de alta sin
 * `rutaFrontend`, `esNavegable` quedaba en falso, y la pantalla no aparecia en
 * el menu de ningun rol que no fuera administrador —aunque el permiso de la
 * accion estuviera concedido—. Pasaba con cuatro pantallas, y una de ellas era
 * la conciliacion bancaria, que es el unico bloqueo del cierre mensual: el
 * sistema exigia conciliar y no dejaba abrir la pantalla para conciliar.
 *
 * Asi que la normalizacion se declara UNA vez, aqui, y los dos lados la usan.
 * El diccionario se sigue escribiendo con nombres legibles y se indexa
 * normalizado.
 * ============================================================================
 */

/** `/x/:estadoCuentaId/reporte` -> `/x/:id/reporte`. Un solo lugar. */
export function normalizarParametrosDeRuta(ruta: string): string {
  return ruta.replace(/\/:\w+/g, '/:id');
}

export function claveDeEndpoint(metodo: string, ruta: string): string {
  return `${metodo.toUpperCase()} ${normalizarParametrosDeRuta(ruta)}`;
}

/*
 * Indice normalizado. Si dos entradas distintas colapsaran en la misma clave
 * —`/x/:clienteId` y `/x/:proveedorId`— el diccionario seria ambiguo y la
 * pantalla que ganara dependeria del orden de escritura. Eso no se resuelve
 * eligiendo una: se detiene el arranque, porque las rutas hay que separarlas.
 */
const INDICE_NAVEGABLE = new Map<string, EndpointNavMeta>();
for (const [clave, meta] of Object.entries(ENDPOINTS_NAVEGABLES)) {
  const [metodo, ...resto] = clave.split(' ');
  const normalizada = claveDeEndpoint(metodo, resto.join(' '));
  const previa = INDICE_NAVEGABLE.get(normalizada);
  if (previa && previa.rutaFrontend !== meta.rutaFrontend) {
    throw new Error(
      `Dos entradas navegables distintas se normalizan a «${normalizada}»: ` +
        `«${previa.rutaFrontend}» y «${meta.rutaFrontend}». ` +
        'Los parametros no viajan en la tabla de permisos, asi que esas dos ' +
        'rutas son la misma para el guardia: hay que diferenciarlas por ruta.',
    );
  }
  INDICE_NAVEGABLE.set(normalizada, meta);
}

/**
 * La pantalla a la que lleva un endpoint, se escriba el parametro como se
 * escriba. Es la unica forma de consultar el diccionario: indexarlo a mano
 * vuelve a introducir el desencuentro.
 */
export function navegableDe(
  metodo: string,
  ruta: string,
): EndpointNavMeta | undefined {
  return INDICE_NAVEGABLE.get(claveDeEndpoint(metodo, ruta));
}
