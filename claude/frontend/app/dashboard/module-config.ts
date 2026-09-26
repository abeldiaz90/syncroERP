/**
 * ============================================================================
 * SyncroERP · Mapa de navegación
 * ----------------------------------------------------------------------------
 * QUÉ SE CORRIGIÓ RESPECTO A LA VERSIÓN ANTERIOR
 *
 * 1. RUTAS HUÉRFANAS. 24 pantallas existían en /app pero no aparecían en
 *    ningún menú: auditoría, unidades de medida, atributos de producto,
 *    cotizaciones de compra, importar inventario, stock inicial, países,
 *    estados, categorías contables, cierre contable, RPA CURP, recetas…
 *    Ahora TODAS están mapeadas.
 *
 * 2. MÓDULOS SIN PREFIJO → SIN BARRA DE NAVEGACIÓN. `/dashboard/rpa`,
 *    `/dashboard/auditoria` y `/dashboard/unidades-medida` no estaban en
 *    ningún `prefixes`, así que `detectarModulo()` devolvía null y la barra
 *    superior simplemente no se pintaba. Esa era la causa principal del
 *    "no se pinta la navegación".
 *
 * 3. COLISIÓN DE PREFIJOS. `/dashboard/marcas` estaba en Inventario y en
 *    Catálogos a la vez; ganaba el primero del array y el ítem no existía en
 *    sus `items`, dejando la pestaña sin resaltar. Ahora cada prefijo
 *    pertenece a un único módulo y la resolución es por especificidad
 *    (el prefijo más largo gana), no por orden del array.
 *
 * 4. ICONOS FANTASMA. Se usaban clases `ti ti-*` (Tabler) que nunca se
 *    cargaron: los cuadros de módulo salían vacíos. Ahora se usan componentes
 *    de `lucide-react`, que ya está instalado.
 *
 * 5. SECCIONES. Los módulos grandes (Finanzas, Compras) se dividen en grupos
 *    para que el menú lateral sea legible con 80+ pantallas.
 * ============================================================================
 */

import {
  ShoppingCart,
  Truck,
  Package,
  CreditCard,
  Calculator,
  BarChart3,
  Database,
  BedDouble,
  Settings,
  Users,
  Wallet,
  Briefcase,
  Building,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export interface ModuleItem {
  label: string;
  href: string;
  /** Agrupación dentro del menú lateral. */
  grupo?: string;
  /** No se lista en el menú, pero sí resuelve el módulo (detalle, PDF, etc.). */
  oculto?: boolean;
  /** Etiqueta corta al lado del ítem: "Nuevo", "Beta". */
  etiqueta?: string;
  /**
   * La pantalla no existe sin el registro financiero externo.
   *
   * Hay instalaciones que sólo usan el ERP, y a ésas no se les debe enseñar la
   * puerta: no es que les falte configurar algo, es que no lo contrataron.
   * «Espejo contable» salía en el centro de trabajo de Finanzas de cualquier
   * empresa; quien entraba leía «esta empresa no espeja su contabilidad», que
   * es una respuesta honesta a una pregunta que nunca debió ofrecerse.
   *
   * El eje importa: una empresa puede espejar contabilidad y no mover cartera,
   * o al revés. `cualquiera` vale para lo que sirve con cualquiera de los dos.
   */
  requiereCore?: 'cualquiera' | 'cartera' | 'contabilidad' | 'validacion';
}

export interface ModuleAction {
  label: string;
  href: string;
  descripcion?: string;
  principal?: boolean;
  /**
   * La acción de servidor que este botón dispara, si dispara alguna.
   *
   * Sin esto, los botones de la barra sólo se filtraban por «¿puede abrir esa
   * pantalla?», y abrir no es poder. Al almacenista —que consulta compras pero
   * no compra— la barra le ofrecía «Nueva requisición» en verde, primario, y
   * el vacío de la pantalla le decía «crea tu primera requisición». Llena el
   * formulario y al guardar, 403. Un botón que lleva a una negativa es peor
   * que no tener el botón: hace perder el trabajo ya hecho.
   *
   * Declarado aquí, el botón sólo aparece si el perfil puede ejecutarlo.
   */
  accion?: { metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; ruta: string };
  /**
   * Se abre en su propia ventana, no navegando dentro del área de trabajo.
   * Hoy solo la caja: es una terminal que se abre al empezar el turno y se
   * cierra al terminarlo, no una pantalla más del ERP.
   */
  ventana?: boolean;
}

export interface ModuleConfig {
  id: string;
  nombre: string;
  /**
   * El modulo de PERMISOS al que corresponde este cajon del menu.
   *
   * El menu agrupa pantallas y los permisos agrupan rutas: son dos preguntas
   * distintas y pueden agrupar distinto. «Reportes» junta pantallas de ventas,
   * caja, credito e inventario, y eso es correcto.
   *
   * Lo que NO puede pasar es que el menu presente como modulo algo que la
   * administracion no puede conceder ni vedar. Eso fue «Almacenes» hasta el
   * 21-sep-2026: el usuario lo veia como una unidad, las rutas del WMS caian
   * en «Inventario», y conceder inventario en consulta entregaba el almacen
   * entero. Peor: `modulosVedados: ['almacenes']` no hacia nada, porque el
   * techo recorre modulos del catalogo de permisos y ese modulo no existia
   * alli. Nada fallaba —ni el compilador, ni una prueba, ni la pantalla.
   *
   * Por eso cada cajon declara ahora que es:
   *   - `moduloPermisos: "inventario"`  el cajon ES ese modulo, con otro nombre
   *   - `agrupacion: true`              junta pantallas de varios modulos
   *   - ninguno de los dos              el `id` ya coincide con el modulo
   *
   * Una prueba de coherencia exige que se cumpla una de las tres.
   */
  moduloPermisos?: string;
  /** Junta pantallas de varios modulos; no es un modulo de permisos. */
  agrupacion?: boolean;
  desc: string;
  Icono: LucideIcon;
  /** Color de acento del módulo (texto, borde activo, espina lateral). */
  color: string;
  /** Fondo suave del ícono. */
  bg: string;
  border: string;
  /** Destino al abrir el módulo desde el panel. */
  href: string;
  prefixes: string[];
  items: ModuleItem[];
  /** Acciones que deben estar a la mano dentro de cualquier pantalla del módulo. */
  acciones?: ModuleAction[];
  /** Vínculos hacia procesos relacionados de otros módulos. */
  relacionados?: ModuleAction[];
}

export const MODULOS: ModuleConfig[] = [
  {
    id: "configuracion", moduloPermisos: "administracion", nombre: "Configuración", desc: "Preparación y diagnóstico empresarial", Icono: Settings,
    color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", href: "/dashboard/configuracion/centro",
    prefixes: ["/dashboard/configuracion", "/dashboard/operaciones/pendientes"],
    items: [
      { label: "Centro de configuración", href: "/dashboard/configuracion/centro", grupo: "Preparación" },
      { label: "Integridad de datos", href: "/dashboard/configuracion/integridad", grupo: "Preparación" },
      { label: "Compatibilidad de BD", href: "/dashboard/configuracion/esquema", grupo: "Preparación" },
      { label: "Operaciones pendientes", href: "/dashboard/operaciones/pendientes", grupo: "Operación" },
      { label: "Wizard de ventas", href: "/dashboard/configuracion/wizard-ventas", grupo: "Asistentes" },
      { label: "Wizard de compras", href: "/dashboard/configuracion/wizard-compras", grupo: "Asistentes" },
      { label: "Wizard de inventario", href: "/dashboard/configuracion/wizard-inventario", grupo: "Asistentes" },
      { label: "Wizard de crédito", href: "/dashboard/configuracion/wizard-credito", grupo: "Asistentes" },
      { label: "Wizard financiero", href: "/dashboard/configuracion/wizard-finanzas", grupo: "Asistentes" },
      { label: "Importación inicial", href: "/dashboard/configuracion/wizard-importacion", grupo: "Asistentes" },
    ],
  },

  /* ── VENTAS ─────────────────────────────────────────────────────────── */
  {
    id: "ventas",
    nombre: "Ventas",
    desc: "Punto de venta, historial y facturación",
    Icono: ShoppingCart,
    color: "#4f46e5",
    bg: "#eef2ff",
    border: "#c7d2fe",
    href: "/dashboard/centros/ventas",
    prefixes: ["/dashboard/centros/ventas", "/dashboard/ventas"],
    acciones: [
      {
        label: "Abrir caja",
        href: "/pos",
        principal: true,
        ventana: true,
        // Quien no puede registrar una venta no puede abrir la caja: sin esto
        // el boton aparecia primario para gerencia, contabilidad y credito, y
        // la ventana se abria solo para decir «tu perfil no incluye la caja».
        accion: { metodo: "POST", ruta: "/ventas" },
      },
      { label: "Historial", href: "/dashboard/ventas/historial" },
      { label: "Devoluciones", href: "/dashboard/ventas/devoluciones" },
    ],
    relacionados: [
      { label: "Clientes", href: "/dashboard/clientes" },
      { label: "Crédito y cobranza", href: "/dashboard/creditos/creditos" },
      { label: "Existencias", href: "/dashboard/almacenes/existencias" },
    ],
    items: [
      /*
       * La caja NO se lista en el menú: vive en su propia ventana (`/pos`) y se
       * abre desde la acción «Abrir caja». Se deja oculta para que la dirección
       * vieja siga resolviendo al módulo de Ventas y quien la tenga guardada no
       * acabe en una pantalla sin navegación.
       */
      {
        label: "Punto de venta",
        href: "/dashboard/ventas/pos",
        grupo: "Operación",
        oculto: true,
      },
      {
        label: "Historial de ventas",
        href: "/dashboard/ventas/historial",
        grupo: "Operación",
      },
      {
        label: "Devoluciones",
        href: "/dashboard/ventas/devoluciones",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
    ],
  },

  /* ── COMPRAS ────────────────────────────────────────────────────────── */
  {
    id: "compras",
    nombre: "Compras",
    desc: "Requisiciones, cotizaciones, órdenes y pagos",
    Icono: Truck,
    color: "#0284c7",
    bg: "#eff6ff",
    border: "#bae6fd",
    href: "/dashboard/centros/compras",
    prefixes: ["/dashboard/centros/compras", "/dashboard/compras", "/dashboard/proveedores"],
    acciones: [
      {
        label: "Nueva requisición",
        href: "/dashboard/compras/requisiciones",
        principal: true,
        accion: { metodo: "POST", ruta: "/api/compras/requisiciones" },
      },
      {
        label: "Comparar cotizaciones",
        href: "/dashboard/compras/cotizaciones",
        accion: { metodo: "POST", ruta: "/api/compras/cotizaciones" },
      },
      { label: "Órdenes pendientes", href: "/dashboard/compras/ordenes" },
      /*
       * Recibir es trabajo de almacén y su pantalla vive en Almacenes. Aquí se
       * queda como acción —el comprador va a ella desde su orden— pero no como
       * renglón del menú: cuando lo era, encendía el cuadro de «Compras» a
       * cualquiera que pudiera consultar recepciones, el vendedor incluido.
       */
      {
        label: "Recibir compra",
        href: "/dashboard/inventario/recepciones",
        accion: { metodo: "PATCH", ruta: "/api/compras/ordenes/:id/recibir" },
      },
    ],
    relacionados: [
      { label: "Almacenes", href: "/dashboard/almacenes/centro" },
      { label: "Bandeja de aprobaciones", href: "/dashboard/aprobaciones" },
      { label: "Flujos de aprobación", href: "/dashboard/configuraciones-aprobacion" },
    ],
    items: [
      {
        label: "Requisiciones",
        href: "/dashboard/compras/requisiciones",
        grupo: "Ciclo de compra",
      },
      {
        label: "Cotizaciones",
        href: "/dashboard/compras/cotizaciones",
        grupo: "Ciclo de compra",
      },
      {
        label: "Aprobaciones",
        href: "/dashboard/compras/aprobaciones",
        grupo: "Ciclo de compra",
      },
      {
        label: "Órdenes de compra",
        href: "/dashboard/compras/ordenes",
        grupo: "Ciclo de compra",
      },
      {
        label: "Pago a proveedores",
        href: "/dashboard/compras/pago-proveedores",
        grupo: "Cuentas por pagar",
      },
      {
        label: "Proveedores",
        href: "/dashboard/proveedores",
        grupo: "Padrón",
      },
    ],
  },

  /* ── APROBACIONES ───────────────────────────────────────────────────
   * La bandeja y los flujos vivían repartidos: la bandeja estaba metida
   * dentro de Hotelería («Aprobaciones de crédito») y dentro de
   * Administración, y los flujos dentro de Compras y dentro de Administración.
   * Como el panel pinta un módulo en cuanto el usuario puede abrir UNA de sus
   * pantallas, cualquiera con la bandeja —recursos humanos, crédito,
   * gerencia— veía encenderse el cuadro de «Hotelería» y el de
   * «Administración». No era un permiso de más: era el mapa mintiendo sobre
   * dónde vive la pantalla.
   *
   * Aprobar es un trabajo propio y transversal, así que tiene su módulo, igual
   * que ya lo tenía del lado del servidor.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    id: "aprobaciones",
    nombre: "Aprobaciones",
    desc: "Lo que espera tu firma y las reglas que deciden a quién le toca",
    Icono: CheckCircle2,
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    href: "/dashboard/aprobaciones",
    prefixes: ["/dashboard/aprobaciones", "/dashboard/configuraciones-aprobacion"],
    relacionados: [
      { label: "Aprobaciones de compra", href: "/dashboard/compras/aprobaciones" },
      { label: "Aprobaciones de estructura", href: "/dashboard/rrhh/aprobaciones-estructura" },
    ],
    items: [
      { label: "Bandeja de aprobaciones", href: "/dashboard/aprobaciones", grupo: "Pendientes" },
      { label: "Flujos de aprobación", href: "/dashboard/configuraciones-aprobacion", grupo: "Reglas" },
    ],
  },

  /* ── PRODUCTOS ─────────────────────────────────────────────────────── */
  {
    id: "productos",
    moduloPermisos: "inventario",
    nombre: "Productos",
    desc: "Catálogo, variantes, precios y logística",
    Icono: Package,
    color: "#0f766e",
    bg: "#f0fdfa",
    border: "#99f6e4",
    href: "/dashboard/centros/productos",
    prefixes: [
      "/dashboard/centros/productos",
      "/dashboard/productos",
      "/dashboard/categorias",
      "/dashboard/marcas",
      "/dashboard/unidades-medida",
      "/dashboard/listas-precio",
    ],
    acciones: [
      { label: "Nuevo producto", href: "/dashboard/productos", descripcion: "Alta y edición del catálogo", principal: true, accion: { metodo: "POST", ruta: "/api/catalogo/productos" } },
      { label: "Listas de precio", href: "/dashboard/listas-precio", descripcion: "Precios y vigencias" },
      { label: "Importar productos", href: "/dashboard/inventario/importar", accion: { metodo: "POST", ruta: "/api/catalogo/importacion/productos" }, descripcion: "Carga inicial desde Excel" },
    ],
    relacionados: [
      { label: "Ver existencias", href: "/dashboard/almacenes/centro", descripcion: "Stock y ubicación física" },
      { label: "Crear requisición", href: "/dashboard/compras/requisiciones", descripcion: "Abastecimiento" },
      { label: "Punto de venta", href: "/dashboard/ventas/pos", descripcion: "Venta del producto" },
    ],
    items: [
      { label: "Catálogo de productos", href: "/dashboard/productos", grupo: "Catálogo" },
      { label: "Atributos y variantes", href: "/dashboard/productos/atributos", grupo: "Catálogo" },
      { label: "Categorías", href: "/dashboard/categorias", grupo: "Catálogo" },
      { label: "Marcas", href: "/dashboard/marcas", grupo: "Catálogo" },
      { label: "Unidades de medida", href: "/dashboard/unidades-medida", grupo: "Catálogo" },
      { label: "Listas de precio", href: "/dashboard/listas-precio", grupo: "Comercial" },
      { label: "Importar desde Excel", href: "/dashboard/inventario/importar", grupo: "Carga de datos" },
      { label: "Stock inicial", href: "/dashboard/inventario/stock-inicial", grupo: "Carga de datos" },
    ],
  },

  /* ── ALMACENES / WMS ───────────────────────────────────────────────── */
  {
    id: "almacenes",
    nombre: "Almacenes",
    desc: "Recepción, ubicación, movimientos, conteos y trazabilidad WMS",
    Icono: Package,
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    href: "/dashboard/almacenes/centro",
    prefixes: [
      "/dashboard/almacenes",
      "/dashboard/inventario/recepciones",
      "/dashboard/inventario/transferencias",
      "/dashboard/inventario/reubicaciones",
      "/dashboard/inventario/conteos",
      "/dashboard/inventario/ubicaciones",
      "/dashboard/inventario/ajustes",
    ],
    acciones: [
      { label: "Recibir mercancía", href: "/dashboard/inventario/recepciones", descripcion: "Órdenes pendientes", principal: true, accion: { metodo: "PATCH", ruta: "/api/compras/ordenes/:id/recibir" } },
      { label: "Crear transferencia", href: "/dashboard/inventario/transferencias", descripcion: "Entre almacenes", accion: { metodo: "POST", ruta: "/api/catalogo/inventario/productos/transferir" } },
      { label: "Reubicar", href: "/dashboard/inventario/reubicaciones", descripcion: "Mover dentro del almacén", accion: { metodo: "POST", ruta: "/api/catalogo/wms/reubicaciones" } },
      { label: "Abrir conteo", href: "/dashboard/inventario/conteos", descripcion: "Conteo físico", accion: { metodo: "POST", ruta: "/api/catalogo/wms/conteos" } },
      { label: "Registrar ajuste", href: "/dashboard/inventario/ajustes", descripcion: "Merma o regularización", accion: { metodo: "POST", ruta: "/api/catalogo/inventario/productos/ajuste" } },
    ],
    relacionados: [
      { label: "Productos", href: "/dashboard/productos", descripcion: "Datos maestros" },
      { label: "Órdenes de compra", href: "/dashboard/compras/ordenes", descripcion: "Origen de recepciones" },
      { label: "Ventas", href: "/dashboard/ventas/historial", descripcion: "Salidas comerciales" },
    ],
    items: [
      { label: "Centro de operaciones", href: "/dashboard/almacenes/centro", grupo: "Operación" },
      { label: "Existencias y posiciones", href: "/dashboard/almacenes/existencias", grupo: "Operación" },
      { label: "Recepciones", href: "/dashboard/inventario/recepciones", grupo: "Entradas" },
      { label: "Transferencias", href: "/dashboard/inventario/transferencias", grupo: "Movimientos" },
      { label: "Reubicaciones", href: "/dashboard/inventario/reubicaciones", grupo: "Movimientos" },
      { label: "Conteos físicos", href: "/dashboard/inventario/conteos", grupo: "Control" },
      { label: "Ajustes y mermas", href: "/dashboard/inventario/ajustes", grupo: "Control" },
      { label: "Ubicaciones", href: "/dashboard/inventario/ubicaciones", grupo: "Configuración" },
      { label: "Catálogo de almacenes", href: "/dashboard/almacenes", grupo: "Configuración" },
    ],
  },

  /* ── CRÉDITO Y COBRANZA ─────────────────────────────────────────────── */
  {
    id: "credito",
    nombre: "Crédito y cobranza",
    desc: "Créditos, cobros y cartera vencida",
    Icono: CreditCard,
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    href: "/dashboard/centros/credito",
    prefixes: ["/dashboard/centros/credito", "/dashboard/creditos"],
    acciones: [
      { label: "Consultar cartera", href: "/dashboard/creditos/creditos", principal: true },
      { label: "Registrar cobranza", href: "/dashboard/creditos/cobranza", accion: { metodo: "POST", ruta: "/api/credito/cobranza/pago" } },
      { label: "Cartera vencida", href: "/dashboard/creditos/cartera-vencida" },
    ],
    items: [
      {
        label: "Créditos",
        href: "/dashboard/creditos/creditos",
        grupo: "Cartera",
      },
      {
        label: "Cobranza",
        href: "/dashboard/creditos/cobranza",
        grupo: "Cartera",
      },
      {
        label: "Cartera vencida",
        href: "/dashboard/creditos/cartera-vencida",
        grupo: "Cartera",
      },
      {
        label: "Estado de cuenta",
        href: "/dashboard/reportes/estado-cuenta",
        grupo: "Cartera",
      },
      {
        // Antes del catálogo, los tipos de crédito vivían en el código: agregar
        // un plazo era desplegar. Esta pantalla es donde se definen ahora.
        label: "Productos de crédito",
        href: "/dashboard/creditos/productos",
        grupo: "Configuración",
      },
      {
        // Qué se le exige a alguien antes de prestarle: identidad, burós,
        // listas. El motor existía desde antes; esto es donde se configura.
        label: "Flujo de verificación",
        href: "/dashboard/creditos/verificacion",
        grupo: "Configuración",
        requiereCore: "validacion",
      },
      {
        // El regreso de la integración: lo que pasó en el core y aquí no está.
        label: "Avisos del core",
        href: "/dashboard/creditos/avisos",
        grupo: "Configuración",
        requiereCore: "cualquiera",
      },
      {
        label: "Cuentas bancarias",
        href: "/dashboard/creditos/cuentas-bancarias",
        grupo: "Configuración",
      },
    ],
  },

  /* ── TESORERÍA (NUEVO) ──────────────────────────────────────────────── */
  {
    id: "tesoreria",
    nombre: "Tesorería",
    desc: "Bancos, conciliación y flujo de efectivo",
    Icono: Wallet,
    color: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
    href: "/dashboard/centros/tesoreria",
    prefixes: ["/dashboard/centros/tesoreria", "/dashboard/tesoreria"],
    items: [
      {
        label: "Caja, corte y arqueo",
        href: "/dashboard/tesoreria/caja",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Movimientos bancarios",
        href: "/dashboard/tesoreria/movimientos",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Conciliación bancaria",
        href: "/dashboard/tesoreria/conciliacion",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Flujo de efectivo",
        href: "/dashboard/tesoreria/flujo",
        grupo: "Análisis",
        etiqueta: "Nuevo",
      },
    ],
    relacionados: [
      { label: "Cuentas bancarias", href: "/dashboard/creditos/cuentas-bancarias" },
      { label: "Corte de caja", href: "/dashboard/reportes/corte-caja" },
    ],
  },

  /* ── FINANZAS ───────────────────────────────────────────────────────── */
  {
    id: "finanzas",
    nombre: "Finanzas",
    desc: "Contabilidad, estados financieros y fiscal",
    Icono: Calculator,
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    href: "/dashboard/centros/finanzas",
    prefixes: ["/dashboard/centros/finanzas", "/dashboard/finanzas"],
    acciones: [
      { label: "Nueva póliza", href: "/dashboard/finanzas/polizas/nueva", principal: true, accion: { metodo: "POST", ruta: "/api/finanzas/polizas" } },
      { label: "Balanza", href: "/dashboard/finanzas/balanza" },
      { label: "Cierre mensual", href: "/dashboard/finanzas/cierre-contable", accion: { metodo: "POST", ruta: "/api/finanzas/cierres/cerrar" } },
      { label: "Asientos pendientes", href: "/dashboard/finanzas/asientos-pendientes" },
    ],
    items: [
      {
        label: "Asistente Maestro",
        href: "/configuracion-financiera",
        grupo: "Configuración",
        etiqueta: "Requerido",
      },
      {
        label: "Libro diario",
        href: "/dashboard/finanzas/polizas",
        grupo: "Registro",
      },
      {
        label: "Nueva póliza",
        href: "/dashboard/finanzas/polizas/nueva",
        grupo: "Registro",
      },
      {
        label: "Saldos iniciales",
        href: "/dashboard/finanzas/saldos-iniciales",
        grupo: "Registro",
      },
      {
        label: "Balanza de comprobación",
        href: "/dashboard/finanzas/balanza",
        grupo: "Estados financieros",
      },
      {
        label: "Estado de resultados",
        href: "/dashboard/finanzas/estado-resultados",
        grupo: "Estados financieros",
      },
      {
        label: "Balance general",
        href: "/dashboard/finanzas/balance-general",
        grupo: "Estados financieros",
      },
      {
        label: "Declaración de IVA",
        href: "/dashboard/finanzas/declaracion-iva",
        grupo: "Fiscal",
      },
      {
        label: "Clasificación SAT",
        href: "/dashboard/finanzas/catalogos-sat",
        grupo: "Fiscal",
        etiqueta: "Guiado",
      },
      {
        label: "Cierre mensual",
        href: "/dashboard/finanzas/cierre-contable",
        grupo: "Fiscal",
        etiqueta: "Guiado",
      },
      {
        label: "Conciliación inicial",
        href: "/dashboard/finanzas/conciliacion-inicial",
        grupo: "Control",
        etiqueta: "Guiado",
      },
      {
        label: "Asientos pendientes",
        href: "/dashboard/finanzas/asientos-pendientes",
        grupo: "Control",
        etiqueta: "Nuevo",
      },
      {
        /*
         * El impuesto de cada producto lo decide Contabilidad y hasta hoy no
         * tenía dónde: la ficha del producto sólo la abre el almacén, que a
         * propósito no ve el catálogo de impuestos.
         */
        label: "Impuestos del catálogo",
        href: "/dashboard/finanzas/fiscal-productos",
        grupo: "Control",
        etiqueta: "Nuevo",
      },
      {
        label: "Integridad financiera",
        href: "/dashboard/finanzas/integridad",
        grupo: "Control",
        /*
         * Decía «Crítico», fijo, siempre. Las demás etiquetas de este menú
         * describen QUÉ ES la pantalla —«Nuevo», «Guiado», «Requerido»— y ésta
         * nombraba un NIVEL DE SEVERIDAD, así que el menú avisaba de un
         * hallazgo crítico también cuando el tablero estaba en verde. Un aviso
         * que no depende de nada es un aviso que nadie vuelve a creer, y el día
         * que haya algo crítico de verdad se verá igual que ayer.
         */
        etiqueta: "Diagnóstico",
      },
      {
        label: "Espejo contable",
        href: "/dashboard/finanzas/espejo-contable",
        grupo: "Control",
        requiereCore: "contabilidad",
      },
      {
        label: "Catálogo de cuentas",
        href: "/dashboard/finanzas/cuentas-contables",
        grupo: "Configuración",
      },
      {
        label: "Categorías contables",
        href: "/dashboard/finanzas/categorias-contables",
        grupo: "Configuración",
      },
    ],
    relacionados: [
      { label: "Impuestos", href: "/dashboard/impuestos" },
      { label: "Categorías de producto", href: "/dashboard/categorias" },
    ],
  },

  /* ── ACTIVOS FIJOS (NUEVO) ──────────────────────────────────────────── */
  {
    id: "activos",
    nombre: "Activos fijos",
    desc: "Altas, depreciación y bajas de activos",
    Icono: Building,
    color: "#65a30d",
    bg: "#f7fee7",
    border: "#d9f99d",
    href: "/dashboard/centros/activos",
    prefixes: ["/dashboard/centros/activos", "/dashboard/activos"],
    items: [
      {
        label: "Registro de activos",
        href: "/dashboard/activos/registro",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Corrida de depreciación",
        href: "/dashboard/activos/depreciacion",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Bajas y ventas",
        href: "/dashboard/activos/bajas",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Cédula de depreciación",
        href: "/dashboard/activos/cedula",
        grupo: "Reportes",
        etiqueta: "Nuevo",
      },
    ],
  },

  /* ── RECURSOS HUMANOS (NUEVO) ───────────────────────────────────────── */
  {
    id: "rrhh",
    nombre: "Recursos humanos",
    desc: "Empleados, asistencia y nómina",
    Icono: Users,
    color: "#db2777",
    bg: "#fdf2f8",
    border: "#fbcfe8",
    href: "/dashboard/centros/rrhh",
    prefixes: ["/dashboard/centros/rrhh", "/dashboard/rrhh", "/dashboard/departamentos"],
    acciones: [
      { label: "Nuevo empleado", href: "/dashboard/rrhh/empleados", principal: true, accion: { metodo: "POST", ruta: "/api/rrhh/empleados" } },
      { label: "Registrar incidencia", href: "/dashboard/rrhh/incidencias", accion: { metodo: "POST", ruta: "/api/rrhh/incidencias" } },
      { label: "Revisar asistencia", href: "/dashboard/rrhh/asistencia", accion: { metodo: "POST", ruta: "/api/rrhh/asistencia" } },
      { label: "Centro integral de nómina", href: "/dashboard/rrhh/centro-nomina" },
    ],
    relacionados: [
      { label: "Puestos", href: "/dashboard/rrhh/puestos" },
      { label: "Departamentos", href: "/dashboard/departamentos" },
      { label: "Usuarios", href: "/dashboard/usuarios" },
    ],
    items: [
      {
        label: "Empleados",
        href: "/dashboard/rrhh/empleados",
        grupo: "Plantilla",
        etiqueta: "Nuevo",
      },
      {
        label: "Puestos y salarios",
        href: "/dashboard/rrhh/puestos",
        grupo: "Plantilla",
        etiqueta: "Nuevo",
      },
      {
        label: "Contratos laborales",
        href: "/dashboard/rrhh/contratos",
        grupo: "Plantilla",
        etiqueta: "Nuevo",
      },
      {
        label: "Bajas y finiquitos",
        href: "/dashboard/rrhh/bajas",
        grupo: "Plantilla",
        etiqueta: "Nuevo",
      },
      {
        label: "Asistencia",
        href: "/dashboard/rrhh/asistencia",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Incidencias",
        href: "/dashboard/rrhh/incidencias",
        grupo: "Operación",
        etiqueta: "Nuevo",
      },
      {
        label: "Vacaciones y saldos",
        href: "/dashboard/rrhh/vacaciones",
        grupo: "Operación",
        etiqueta: "Ampliado",
      },
      {
        label: "Periodos de nómina",
        href: "/dashboard/rrhh/nomina",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Centro integral de nómina",
        href: "/dashboard/rrhh/centro-nomina",
        grupo: "Nómina",
        etiqueta: "Ampliado",
      },
      {
        label: "Configuración patronal",
        href: "/dashboard/rrhh/configuracion-nomina",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Conceptos y asignaciones",
        href: "/dashboard/rrhh/conceptos-nomina",
        grupo: "Nómina",
        etiqueta: "Ampliado",
      },
      {
        label: "Cuentas bancarias",
        href: "/dashboard/rrhh/cuentas-bancarias",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Préstamos y descuentos",
        href: "/dashboard/rrhh/prestamos",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Dispersión y pagos",
        href: "/dashboard/rrhh/pagos",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Cumplimiento y cierre",
        href: "/dashboard/rrhh/cumplimiento",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Recibos",
        href: "/dashboard/rrhh/recibos",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      /*
       * Esta pantalla existía y era alcanzable desde Puestos, Departamentos y
       * el asistente de empleado, pero no estaba en el mapa de navegación: se
       * pintaba sin barra de módulo ni breadcrumb y, como el layout valida
       * `puedeEntrar(permisos, pathname)`, cualquier usuario que no fuera
       * administrador recibía «sin acceso» al llegar por esos enlaces. El
       * flujo completo (solicitud → Gerencia → Finanzas) estaba construido y
       * sólo lo podía ejecutar un administrador.
       */
      {
        label: "Aprobaciones de estructura",
        href: "/dashboard/rrhh/aprobaciones-estructura",
        grupo: "Plantilla",
      },
      {
        label: "Departamentos",
        href: "/dashboard/departamentos",
        grupo: "Configuración",
      },
    ],
  },

  /* ── CRM (NUEVO) ────────────────────────────────────────────────────── */
  {
    id: "crm",
    nombre: "CRM",
    desc: "Prospectos, oportunidades y seguimiento",
    Icono: Briefcase,
    color: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
    href: "/dashboard/centros/crm",
    prefixes: ["/dashboard/centros/crm", "/dashboard/crm"],
    items: [
      {
        label: "Pipeline",
        href: "/dashboard/crm/pipeline",
        grupo: "Ventas",
        etiqueta: "Nuevo",
      },
      {
        label: "Oportunidades",
        href: "/dashboard/crm/oportunidades",
        grupo: "Ventas",
        etiqueta: "Nuevo",
      },
      {
        label: "Actividades",
        href: "/dashboard/crm/actividades",
        grupo: "Seguimiento",
        etiqueta: "Nuevo",
      },
    ],
    relacionados: [{ label: "Clientes", href: "/dashboard/clientes" }],
  },

  /* ── REPORTES ───────────────────────────────────────────────────────── */
  {
    id: "reportes",
    agrupacion: true, // junta ventas, caja, credito e inventario
    nombre: "Reportes",
    desc: "Indicadores gerenciales y operativos",
    Icono: BarChart3,
    color: "#0d9488",
    bg: "#f0fdfa",
    border: "#99f6e4",
    href: "/dashboard/centros/reportes",
    prefixes: ["/dashboard/centros/reportes", "/dashboard/reportes"],
    items: [
      {
        label: "Panel ejecutivo",
        href: "/dashboard/reportes/ejecutivo",
        grupo: "Dirección",
      },
      {
        label: "Ventas",
        href: "/dashboard/reportes/ventas",
        grupo: "Operación",
      },
      {
        label: "Top de productos",
        href: "/dashboard/reportes/top-productos",
        grupo: "Operación",
      },
      {
        label: "Inventario",
        href: "/dashboard/reportes/inventario",
        grupo: "Operación",
      },
      {
        label: "Corte de caja",
        href: "/dashboard/reportes/corte-caja",
        grupo: "Operación",
      },
      {
        label: "Índice de reportes",
        href: "/dashboard/reportes",
        grupo: "Operación",
        oculto: true,
      },
    ],
  },

  /* ── CATÁLOGOS ──────────────────────────────────────────────────────── */
  {
    id: "catalogos",
    nombre: "Catálogos",
    desc: "Clientes, impuestos y datos maestros",
    Icono: Database,
    color: "#e11d48",
    bg: "#fff1f2",
    border: "#fecdd3",
    href: "/dashboard/centros/catalogos",
    prefixes: [
      "/dashboard/centros/catalogos",
      "/dashboard/clientes",
      "/dashboard/impuestos",
      "/dashboard/catalogos",
    ],
    relacionados: [
      { label: "Proveedores", href: "/dashboard/proveedores" },
      { label: "Listas de precio", href: "/dashboard/listas-precio" },
    ],
    items: [
      { label: "Clientes", href: "/dashboard/clientes", grupo: "Terceros" },
      { label: "Impuestos", href: "/dashboard/impuestos", grupo: "Comercial" },
      {
        label: "Formas de pago",
        href: "/dashboard/catalogos/formas-pago",
        grupo: "Sistema",
      },
      {
        label: "Bancos",
        href: "/dashboard/catalogos/bancos",
        grupo: "Sistema",
      },
      {
        label: "Países",
        href: "/dashboard/catalogos/paises",
        grupo: "Sistema",
      },
      {
        label: "Estados",
        href: "/dashboard/catalogos/estados",
        grupo: "Sistema",
      },
    ],
  },

  /* ── HOTELERÍA ──────────────────────────────────────────────────────── */
  {
    id: "hoteleria",
    nombre: "Hotelería",
    desc: "Rack, reservas, housekeeping, city ledger y recetas",
    Icono: BedDouble,
    color: "#0f766e",
    bg: "#f0fdfa",
    border: "#99f6e4",
    href: "/dashboard/centros/hoteleria",
    prefixes: ["/dashboard/centros/hoteleria", "/dashboard/hoteleria"],
    relacionados: [{ label: "Bandeja de aprobaciones", href: "/dashboard/aprobaciones" }],
    items: [
      {
        label: "Panel hotelero",
        href: "/dashboard/hoteleria/panel",
        grupo: "Recepción",
      },
      {
        label: "Rack de habitaciones",
        href: "/dashboard/hoteleria/rack",
        grupo: "Recepción",
      },
      {
        label: "Reservaciones",
        href: "/dashboard/hoteleria/reservaciones",
        grupo: "Recepción",
      },
      {
        label: "Folios y check-out",
        href: "/dashboard/hoteleria/folios",
        grupo: "Recepción",
        etiqueta: "Financiero",
      },
      {
        label: "Auditoría nocturna",
        href: "/dashboard/hoteleria/auditoria",
        grupo: "Recepción",
      },
      {
        label: "Housekeeping",
        href: "/dashboard/hoteleria/housekeeping",
        grupo: "Operación",
      },
      {
        label: "City Ledger y cobranza",
        href: "/dashboard/hoteleria/city-ledger",
        grupo: "Crédito hotelero",
        etiqueta: "Convenios",
      },
      /*
       * Los escandallos son del restaurante del hotel: de qué se compone una
       * margarita o una hamburguesa, y cuánto cuesta servirla. Estuvieron un
       * rato bajo Productos porque el módulo «recetas» del servidor lo tenía el
       * almacenista, pero eso era el error de fondo, no la ubicación: quien
       * surte el almacén no prepara hamburguesas. Se le retiró el módulo y las
       * pantallas vuelven a su casa, con Alimentos y bebidas.
       */
      {
        label: "Recetas y escandallos",
        href: "/dashboard/hoteleria/recetas",
        grupo: "Alimentos y bebidas",
      },
      {
        label: "Control de costos",
        href: "/dashboard/hoteleria/costos-recetas",
        grupo: "Alimentos y bebidas",
      },
      {
        label: "Configuración",
        href: "/dashboard/hoteleria/configuracion",
        grupo: "Configuración",
      },
    ],
  },

  /* ── ADMINISTRACIÓN ─────────────────────────────────────────────────── */
  {
    id: "admin",
    moduloPermisos: "administracion",
    nombre: "Administración",
    desc: "Usuarios, permisos, auditoría y herramientas",
    Icono: Settings,
    color: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0",
    href: "/dashboard/centros/admin",
    prefixes: [
      "/dashboard/centros/admin",
      "/dashboard/usuarios",
      "/dashboard/permisos",
      "/dashboard/auditoria",
      "/dashboard/rpa",
    ],
    items: [
      { label: "Usuarios", href: "/dashboard/usuarios", grupo: "Accesos" },
      {
        label: "Roles y permisos",
        href: "/dashboard/permisos",
        grupo: "Accesos",
      },
      {
        label: "Bitácora de auditoría",
        href: "/dashboard/auditoria",
        grupo: "Control",
      },
      {
        label: "Consulta de CURP (RPA)",
        href: "/dashboard/rpa/curp",
        grupo: "Herramientas",
      },
    ],
  },
];

/* ── Contenedores ────────────────────────────────────────────────────────── */

/**
 * Pantallas que no son una pantalla, sino la portada de un módulo: no tienen
 * datos propios, sólo enlaces a las de dentro.
 *
 * Importan para el control de acceso. El permiso de pantalla cubre la ruta y
 * SUS DESCENDIENTES —así `/dashboard/compras/ordenes` abre también el detalle
 * de una orden—, de modo que conceder una portada concede todo lo que cuelga
 * de ella. `/dashboard/reportes` lo hacía: quien tuviera el índice entraba
 * además al panel ejecutivo, al corte de caja y al estado de cuenta de los
 * clientes, que son de otros módulos.
 *
 * Por eso ninguna acción concede ya una portada. Se entra a ella si se puede
 * abrir al menos una pantalla de dentro, que es lo que el layout comprueba.
 */
export const RUTAS_CONTENEDOR = new Set<string>([
  "/dashboard/reportes",
  "/dashboard/almacenes/centro",
  // Redirige al centro de trabajo y no trae datos propios; el panel hotelero
  // con cifras vive en `/dashboard/hoteleria/panel`, que se concede aparte.
  "/dashboard/hoteleria",
]);

/* ── Resolución de módulo ────────────────────────────────────────────────── */

/**
 * Resuelve el módulo por el prefijo MÁS LARGO que coincida, comparando
 * segmentos completos. Así `/dashboard/productos/atributos` resuelve
 * Inventario sin ambigüedad, y un prefijo nuevo más específico gana sobre uno
 * genérico sin depender del orden del array.
 */
export function detectarModulo(pathname: string): ModuleConfig | null {
  if (!pathname || pathname === "/dashboard" || pathname === "/dashboard/")
    return null;

  let ganador: ModuleConfig | null = null;
  let mejorLargo = -1;

  for (const m of MODULOS) {
    for (const p of m.prefixes) {
      const coincide = pathname === p || pathname.startsWith(p + "/");
      if (coincide && p.length > mejorLargo) {
        mejorLargo = p.length;
        ganador = m;
      }
    }
  }
  return ganador;
}

/** Ítem activo dentro del módulo (para resaltar y para el breadcrumb). */
export function detectarItem(
  modulo: ModuleConfig | null,
  pathname: string,
): ModuleItem | null {
  if (!modulo) return null;
  const candidatos = modulo.items.filter(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
  if (!candidatos.length) return null;
  return candidatos.reduce((a, b) => (b.href.length > a.href.length ? b : a));
}

/** Índice plano de todas las pantallas: alimenta la paleta de comandos. */
export interface EntradaBusqueda {
  label: string;
  href: string;
  modulo: string;
  color: string;
  grupo?: string;
}

export const INDICE_PANTALLAS: EntradaBusqueda[] = MODULOS.flatMap((m) =>
  m.items
    .filter((i) => !i.oculto)
    .map((i) => ({
      label: i.label,
      href: i.href,
      modulo: m.nombre,
      color: m.color,
      grupo: i.grupo,
    })),
).filter((e, i, arr) => arr.findIndex((x) => x.href === e.href) === i);

/** Agrupa los ítems visibles de un módulo respetando el orden de aparición. */
export function agruparItems(
  items: ModuleItem[],
): Array<[string, ModuleItem[]]> {
  const mapa = new Map<string, ModuleItem[]>();
  for (const it of items) {
    if (it.oculto) continue;
    const g = it.grupo ?? "General";
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g)!.push(it);
  }
  return Array.from(mapa.entries());
}
