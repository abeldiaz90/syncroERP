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
}

export interface ModuleConfig {
  id: string;
  nombre: string;
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
}

export const MODULOS: ModuleConfig[] = [
  /* ── VENTAS ─────────────────────────────────────────────────────────── */
  {
    id: "ventas",
    nombre: "Ventas",
    desc: "Punto de venta, historial y facturación",
    Icono: ShoppingCart,
    color: "#4f46e5",
    bg: "#eef2ff",
    border: "#c7d2fe",
    href: "/dashboard/ventas/pos",
    prefixes: ["/dashboard/ventas"],
    items: [
      {
        label: "Punto de venta",
        href: "/dashboard/ventas/pos",
        grupo: "Operación",
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
      {
        label: "Ticket",
        href: "/dashboard/ventas/ticket",
        grupo: "Operación",
        oculto: true,
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
    href: "/dashboard/compras/requisiciones",
    prefixes: ["/dashboard/compras"],
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
        label: "Recepciones",
        href: "/dashboard/inventario/recepciones",
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
        grupo: "Cuentas por pagar",
      },
      {
        label: "Flujos de aprobación",
        href: "/dashboard/configuraciones-aprobacion",
        grupo: "Configuración",
      },
    ],
  },

  /* ── INVENTARIO ─────────────────────────────────────────────────────── */
  {
    id: "inventario",
    nombre: "Inventario",
    desc: "Productos, stock multialmacén y movimientos",
    Icono: Package,
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    href: "/dashboard/productos",
    prefixes: [
      "/dashboard/inventario",
      "/dashboard/productos",
      "/dashboard/almacenes",
      "/dashboard/categorias",
      "/dashboard/marcas",
      "/dashboard/unidades-medida",
    ],
    items: [
      { label: "Productos", href: "/dashboard/productos", grupo: "Catálogo" },
      {
        label: "Atributos y variantes",
        href: "/dashboard/productos/atributos",
        grupo: "Catálogo",
      },
      { label: "Categorías", href: "/dashboard/categorias", grupo: "Catálogo" },
      { label: "Marcas", href: "/dashboard/marcas", grupo: "Catálogo" },
      {
        label: "Unidades de medida",
        href: "/dashboard/unidades-medida",
        grupo: "Catálogo",
      },
      {
        label: "Almacenes",
        href: "/dashboard/almacenes",
        grupo: "Existencias",
      },
      {
        label: "Transferencias",
        href: "/dashboard/inventario/transferencias",
        grupo: "Existencias",
      },
      {
        label: "Ajustes de stock",
        href: "/dashboard/inventario/ajustes",
        grupo: "Existencias",
      },
      {
        label: "Recepciones",
        href: "/dashboard/inventario/recepciones",
        grupo: "Existencias",
      },
      {
        label: "Stock inicial",
        href: "/dashboard/inventario/stock-inicial",
        grupo: "Carga de datos",
      },
      {
        label: "Importar desde Excel",
        href: "/dashboard/inventario/importar",
        grupo: "Carga de datos",
      },
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
    href: "/dashboard/creditos/creditos",
    prefixes: ["/dashboard/creditos"],
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
    href: "/dashboard/tesoreria/movimientos",
    prefixes: ["/dashboard/tesoreria"],
    items: [
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
      {
        label: "Cuentas bancarias",
        href: "/dashboard/creditos/cuentas-bancarias",
        grupo: "Configuración",
      },
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
    href: "/dashboard/finanzas/polizas",
    prefixes: ["/dashboard/finanzas"],
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
        label: "Catálogo de cuentas",
        href: "/dashboard/finanzas/cuentas-contables",
        grupo: "Configuración",
      },
      {
        label: "Categorías contables",
        href: "/dashboard/finanzas/categorias-contables",
        grupo: "Configuración",
      },
      {
        label: "Impuestos",
        href: "/dashboard/impuestos",
        grupo: "Configuración",
      },
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
    href: "/dashboard/activos/registro",
    prefixes: ["/dashboard/activos"],
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
    href: "/dashboard/rrhh/empleados",
    prefixes: ["/dashboard/rrhh"],
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
        label: "Periodos de nómina",
        href: "/dashboard/rrhh/nomina",
        grupo: "Nómina",
        etiqueta: "Nuevo",
      },
      {
        label: "Recibos",
        href: "/dashboard/rrhh/recibos",
        grupo: "Nómina",
        etiqueta: "Nuevo",
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
    href: "/dashboard/crm/pipeline",
    prefixes: ["/dashboard/crm"],
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
      { label: "Clientes", href: "/dashboard/clientes", grupo: "Cartera" },
    ],
  },

  /* ── REPORTES ───────────────────────────────────────────────────────── */
  {
    id: "reportes",
    nombre: "Reportes",
    desc: "Indicadores gerenciales y operativos",
    Icono: BarChart3,
    color: "#0d9488",
    bg: "#f0fdfa",
    border: "#99f6e4",
    href: "/dashboard/reportes",
    prefixes: ["/dashboard/reportes"],
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
        label: "Estado de cuenta",
        href: "/dashboard/reportes/estado-cuenta",
        grupo: "Cartera",
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
    desc: "Clientes, proveedores y datos maestros",
    Icono: Database,
    color: "#e11d48",
    bg: "#fff1f2",
    border: "#fecdd3",
    href: "/dashboard/clientes",
    prefixes: [
      "/dashboard/clientes",
      "/dashboard/proveedores",
      "/dashboard/impuestos",
      "/dashboard/listas-precio",
      "/dashboard/catalogos",
    ],
    items: [
      { label: "Clientes", href: "/dashboard/clientes", grupo: "Terceros" },
      {
        label: "Proveedores",
        href: "/dashboard/proveedores",
        grupo: "Terceros",
      },
      {
        label: "Listas de precio",
        href: "/dashboard/listas-precio",
        grupo: "Comercial",
      },
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
    desc: "Rack, reservas, housekeeping y recetas",
    Icono: BedDouble,
    color: "#0f766e",
    bg: "#f0fdfa",
    border: "#99f6e4",
    href: "/dashboard/hoteleria/rack",
    prefixes: ["/dashboard/hoteleria"],
    items: [
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
        label: "Recetas y escandallos",
        href: "/dashboard/hoteleria/recetas",
        grupo: "Alimentos y bebidas",
      },
      {
        label: "Control de costos",
        href: "/dashboard/hoteleria/costos-recetas",
        grupo: "Alimentos y bebidas",
        etiqueta: "Nuevo",
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
    nombre: "Administración",
    desc: "Usuarios, permisos, auditoría y herramientas",
    Icono: Settings,
    color: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0",
    href: "/dashboard/usuarios",
    prefixes: [
      "/dashboard/usuarios",
      "/dashboard/departamentos",
      "/dashboard/permisos",
      "/dashboard/configuraciones-aprobacion",
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
        label: "Departamentos",
        href: "/dashboard/departamentos",
        grupo: "Organización",
      },
      {
        label: "Flujos de aprobación",
        href: "/dashboard/configuraciones-aprobacion",
        grupo: "Organización",
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
