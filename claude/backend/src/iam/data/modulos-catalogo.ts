// iam/data/modulos-catalogo.ts
/**
 * ============================================================================
 * Catálogo de módulos de negocio
 * ----------------------------------------------------------------------------
 * La unidad con la que se reparte el acceso en el ERP.
 *
 * Antes no existía. Lo que había era el "controlador", que no es un módulo de
 * negocio sino un accidente del código: se deriva del primer segmento del path
 * del `@Controller`, así que `@Controller('admin/permisos')` producía el módulo
 * `admin` y `@Controller('usuarios')` producía otro, y ambos —más
 * `departamentos` y `configuraciones-aprobacion`— se titulaban «Administración».
 * En pantalla salían cuatro tarjetas idénticas e indistinguibles. Al revés
 * pasaba lo mismo: `catalogo` era un solo controlador con 87 endpoints que
 * mezclaba el almacén con las listas de precio y los impuestos.
 *
 * Aquí un módulo es lo que un negocio llama un módulo, y se define por PREFIJOS
 * DE RUTA, no por controladores. Gana el prefijo más largo, de modo que
 * `/catalogo/listas-precio` cae en Precios aunque `/catalogo` pertenezca a
 * Inventario. Lo que no encaje en ninguno cae en «Otros»: preferimos un módulo
 * feo y visible a un endpoint invisible que nadie puede conceder ni quitar.
 *
 * REGLA DE ORO al agregar rutas nuevas: si aparece un endpoint en «Otros», es
 * que falta declararlo aquí. No se arregla en la pantalla, se arregla en esta
 * lista.
 *
 * `sensible: true` marca los módulos que dan poder sobre el propio sistema
 * —administrar usuarios y permisos, o mover la integración con el core—. No
 * los bloquea: los pinta distinto para que nadie los conceda de pasada.
 * ============================================================================
 */

export interface ModuloNegocio {
  /** Identificador estable. Es lo que se guarda y se manda por la API. */
  id: string;
  nombre: string;
  descripcion: string;
  /** Nombre del icono de lucide, igual que en el frontend. */
  icono: string;
  /** Agrupador visual de la pantalla. */
  grupo: 'Operación' | 'Catálogos' | 'Finanzas' | 'Personas' | 'Sistema';
  orden: number;
  /** Prefijos de ruta del backend, sin el prefijo global `/api`. */
  prefijos: string[];
  /** Da poder sobre el propio sistema. Se concede a conciencia. */
  sensible?: boolean;
}

export const MODULO_OTROS = 'otros';

/**
 * Lo que un rol puede tener sobre un modulo. Tres estados y no mas, porque son
 * los que un administrador sabe explicar sin abrir el codigo.
 */
export type AccesoModulo = 'completo' | 'consulta' | 'ninguno';

export const MODULOS_NEGOCIO: ModuloNegocio[] = [
  // ── Operación ────────────────────────────────────────────────────────────
  {
    id: 'ventas',
    nombre: 'Ventas y punto de venta',
    descripcion: 'Mostrador, ventas, devoluciones y tablero de ventas.',
    icono: 'ShoppingCart',
    grupo: 'Operación',
    orden: 10,
    prefijos: ['/ventas'],
  },
  {
    id: 'clientes',
    nombre: 'Clientes',
    descripcion: 'Expediente del cliente, alta y edición.',
    icono: 'Users',
    grupo: 'Operación',
    orden: 11,
    prefijos: ['/clientes'],
  },
  {
    id: 'facturacion',
    nombre: 'Facturación (CFDI)',
    descripcion: 'Timbrado, complementos de pago, devoluciones y configuración fiscal.',
    icono: 'FileText',
    grupo: 'Operación',
    orden: 12,
    prefijos: ['/cfdi'],
  },
  {
    id: 'credito',
    nombre: 'Crédito y cobranza',
    descripcion: 'Líneas de crédito, productos de crédito, cobranza y estado de cuenta.',
    icono: 'CreditCard',
    grupo: 'Operación',
    orden: 13,
    prefijos: ['/credito'],
  },
  {
    id: 'compras',
    nombre: 'Compras',
    descripcion: 'Requisiciones, cotizaciones, órdenes de compra y recepción.',
    icono: 'ShoppingBag',
    grupo: 'Operación',
    orden: 14,
    prefijos: ['/compras'],
  },
  {
    id: 'proveedores',
    nombre: 'Proveedores',
    descripcion: 'Padrón de proveedores.',
    icono: 'Truck',
    grupo: 'Operación',
    orden: 15,
    prefijos: ['/proveedores'],
  },
  {
    id: 'hoteleria',
    nombre: 'Hotelería',
    descripcion: 'Operación, disponibilidad, ama de llaves, city ledger y auditoría nocturna.',
    icono: 'BedDouble',
    grupo: 'Operación',
    orden: 16,
    prefijos: ['/hoteleria'],
  },
  {
    id: 'crm',
    nombre: 'CRM',
    descripcion: 'Prospectos, oportunidades, pipeline y agenda comercial.',
    icono: 'Target',
    grupo: 'Operación',
    orden: 17,
    prefijos: ['/crm'],
  },
  {
    id: 'aprobaciones',
    nombre: 'Aprobaciones',
    descripcion: 'Bandeja central de aprobaciones y los flujos que la gobiernan.',
    icono: 'CheckCircle2',
    grupo: 'Operación',
    orden: 18,
    prefijos: ['/aprobaciones', '/configuraciones-aprobacion'],
  },

  // ── Catálogos ────────────────────────────────────────────────────────────
  {
    id: 'inventario',
    nombre: 'Inventario y almacén',
    descripcion:
      'Productos, categorías, marcas, unidades, almacenes, existencias, WMS e importación.',
    icono: 'Package',
    grupo: 'Catálogos',
    orden: 20,
    // `/catalogo` va al final como red de seguridad: cualquier ruta nueva de
    // ese árbol cae aquí en vez de quedar huérfana. Los prefijos más largos
    // de Precios ganan sobre él.
    prefijos: [
      /*
       * La recepción de mercancía es trabajo de almacén, aunque cuelgue de la
       * ruta de compras.
       *
       * Con la clasificación por prefijo caía en «Compras», y la plantilla del
       * almacenista da compras sólo en consulta: veía la pantalla de recepción
       * —el GET pasa— capturaba todo con el camión enfrente, y al guardar
       * recibía un 403. La mercancía se quedaba sin ingresar hasta que la
       * capturara un comprador, que no la vio físicamente.
       *
       * Estos dos prefijos son más largos que `/compras`, así que ganan.
       */
      '/compras/ordenes/:id/recibir',
      '/compras/ordenes/recepciones',
      '/catalogo/productos',
      '/catalogo/categorias',
      '/catalogo/marcas',
      '/catalogo/unidades-medida',
      '/catalogo/almacenes',
      '/catalogo/inventario',
      '/catalogo/wms',
      '/catalogo/importacion',
      '/catalogo/atributos-personalizados',
      '/catalogo',
    ],
  },
  {
    id: 'precios',
    nombre: 'Precios e impuestos',
    descripcion: 'Listas de precio e impuestos aplicables.',
    icono: 'Tags',
    grupo: 'Catálogos',
    orden: 21,
    prefijos: ['/catalogo/listas-precio', '/catalogo/impuestos'],
  },
  {
    id: 'catalogos',
    nombre: 'Catálogos generales',
    descripcion: 'Bancos, formas de pago, países y estados.',
    icono: 'BookMarked',
    grupo: 'Catálogos',
    orden: 22,
    prefijos: ['/catalogos'],
  },
  {
    id: 'recetas',
    nombre: 'Recetas y producción',
    descripcion: 'Recetas, explosión de insumos, costeo y producción.',
    icono: 'ChefHat',
    grupo: 'Catálogos',
    orden: 23,
    prefijos: ['/recetas'],
  },

  // ── Finanzas ─────────────────────────────────────────────────────────────
  {
    id: 'finanzas',
    nombre: 'Contabilidad',
    descripcion: 'Pólizas, cuentas contables, cierres, catálogos SAT e integridad.',
    icono: 'Calculator',
    grupo: 'Finanzas',
    orden: 30,
    prefijos: [
      '/finanzas',
      /*
       * A qué cuenta contable va cada familia de productos. Cuelga de
       * `/catalogo`, que es del almacén, y por eso vivía en «Inventario»: el
       * almacenista podía reasignar la cuenta de costo de toda una familia sin
       * que nadie lo viera hasta el cierre. Estos dos prefijos son más largos
       * que `/catalogo`, así que ganan, y la decisión contable queda con
       * Contabilidad. El catálogo —nombre, padre, alta y baja— sigue siendo
       * del almacén.
       */
      '/catalogo/categorias/:id/cuentas',
      '/catalogo/categorias/auto-configurar',
      /*
       * La puerta de atrás del asistente de recetas. `POST
       * /recetas/wizard/crear-cuentas` llama a `precargarPlanEstandar` —siembra
       * el catálogo de cuentas entero— y `crear-categoria` crea una categoría y
       * le auto-mapea sus cinco cuentas, que es exactamente lo que se acaba de
       * sacar del alcance del almacén por la puerta de delante. Vivía bajo
       * `/recetas`, un módulo que el almacenista tiene completo, así que el
       * candado de las categorías se rodeaba con otra ruta. Probado en vivo con
       * su sesión: respondió 201 y creó la categoría «Insumos Bar» con sus
       * cinco cuentas puestas.
       */
      '/recetas/wizard',
      /*
       * El costo teórico contra el real y su recálculo son costeo, no almacén:
       * de ahí sale el margen por producto. Quien mueve la mercancía reporta lo
       * que consumió; quién decide qué cuesta es otra silla.
       */
      '/recetas/costos',
    ],
  },
  {
    id: 'tesoreria',
    nombre: 'Tesorería',
    descripcion: 'Saldos, movimientos, traspasos, conciliación y flujo de efectivo.',
    icono: 'Landmark',
    grupo: 'Finanzas',
    orden: 31,
    prefijos: ['/tesoreria'],
  },
  {
    id: 'caja',
    nombre: 'Caja',
    descripcion: 'Turnos de caja y movimientos de efectivo.',
    icono: 'Wallet',
    grupo: 'Finanzas',
    orden: 32,
    prefijos: ['/caja'],
  },
  {
    id: 'activos',
    nombre: 'Activos fijos',
    descripcion: 'Altas, categorías, depreciación y reportes de activos.',
    icono: 'Building2',
    grupo: 'Finanzas',
    orden: 33,
    prefijos: ['/activos'],
  },

  // ── Personas ─────────────────────────────────────────────────────────────
  {
    id: 'rrhh',
    nombre: 'Recursos humanos',
    descripcion:
      'Empleados, puestos, contratos, asistencia, incidencias, vacaciones, nómina y departamentos.',
    icono: 'UserCog',
    grupo: 'Personas',
    orden: 40,
    prefijos: ['/rrhh', '/departamentos'],
  },

  // ── Sistema ──────────────────────────────────────────────────────────────
  {
    id: 'tablero',
    nombre: 'Tablero ejecutivo',
    descripcion: 'Indicadores de dirección.',
    icono: 'LayoutDashboard',
    grupo: 'Sistema',
    orden: 50,
    prefijos: ['/dashboard'],
  },
  {
    id: 'integracion',
    nombre: 'Integración con Fineract',
    descripcion:
      'Configuración del core, outbox, conciliación, avisos, validación y correspondencia de roles.',
    icono: 'Link2',
    grupo: 'Sistema',
    orden: 51,
    prefijos: ['/integracion'],
    sensible: true,
  },
  {
    id: 'administracion',
    nombre: 'Administración del sistema',
    descripcion:
      'Usuarios, roles y permisos, configuración de la empresa, auditoría y herramientas.',
    icono: 'ShieldCheck',
    grupo: 'Sistema',
    orden: 52,
    prefijos: ['/usuarios', '/admin', '/configuracion', '/auditoria', '/rpa'],
    sensible: true,
  },

  // ── Red de seguridad ─────────────────────────────────────────────────────
  {
    id: MODULO_OTROS,
    nombre: 'Otros',
    descripcion:
      'Rutas que todavía no están declaradas en ningún módulo. Si aparece algo aquí, falta declararlo en el catálogo de módulos.',
    icono: 'HelpCircle',
    grupo: 'Sistema',
    orden: 99,
    prefijos: [],
  },
];

/** Índice prefijo → módulo, ordenado del prefijo más largo al más corto. */
const PREFIJOS_ORDENADOS: Array<{ prefijo: string; moduloId: string }> =
  MODULOS_NEGOCIO.flatMap((m) => m.prefijos.map((prefijo) => ({ prefijo, moduloId: m.id })))
    .sort((a, b) => b.prefijo.length - a.prefijo.length);

/**
 * A qué módulo pertenece una ruta del backend. Gana el prefijo más largo, para
 * que `/catalogo/listas-precio` no se lo quede Inventario por `/catalogo`.
 */
export function moduloDeRuta(ruta: string): string {
  const limpia = (ruta || '').replace(/\/+$/, '') || '/';
  for (const { prefijo, moduloId } of PREFIJOS_ORDENADOS) {
    if (limpia === prefijo || limpia.startsWith(prefijo + '/')) return moduloId;
  }
  return MODULO_OTROS;
}

export const MODULOS_POR_ID = new Map(MODULOS_NEGOCIO.map((m) => [m.id, m]));

/** Todos los módulos que se pueden conceder, sin la red de seguridad. */
export const MODULOS_ASIGNABLES = MODULOS_NEGOCIO.filter((m) => m.id !== MODULO_OTROS).map(
  (m) => m.id,
);
