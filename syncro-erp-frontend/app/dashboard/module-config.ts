// Configuración central de módulos del ERP
// Define la estructura del launchpad y la navegación contextual

export interface ModuleItem {
  label: string;
  href:  string;
  icon?: string;
}

export interface ModuleConfig {
  id:      string;
  nombre:  string;
  desc:    string;
  icon:    string;       // Tabler icon class
  color:   string;       // texto
  bg:      string;       // fondo del ícono
  border:  string;       // borde del badge
  href:    string;       // ruta base
  prefixes: string[];    // prefijos de URL que pertenecen a este módulo
  items:   ModuleItem[];
}

export const MODULOS: ModuleConfig[] = [
  {
    id: 'ventas',
    nombre: 'Ventas',
    desc: 'POS, historial y cotizaciones',
    icon: 'ti-shopping-cart',
    color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe',
    href: '/dashboard/ventas/pos',
    prefixes: ['/dashboard/ventas'],
    items: [
      { label: 'Punto de Venta',  href: '/dashboard/ventas/pos'      },
      { label: 'Historial',       href: '/dashboard/ventas/historial' },
    ],
  },
  {
    id: 'compras',
    nombre: 'Compras',
    desc: 'Requisiciones, OC y pagos a proveedores',
    icon: 'ti-truck',
    color: '#0284c7', bg: '#eff6ff', border: '#bae6fd',
    href: '/dashboard/compras/requisiciones',
    prefixes: ['/dashboard/compras'],
    items: [
      { label: 'Requisiciones',      href: '/dashboard/compras/requisiciones'   },
      { label: 'Aprobaciones',       href: '/dashboard/compras/aprobaciones'    },
      { label: 'Órdenes de Compra',  href: '/dashboard/compras/ordenes'         },
      { label: 'Recepciones',        href: '/dashboard/inventario/recepciones'  },
      { label: 'Pago Proveedores',   href: '/dashboard/compras/pago-proveedores'},
    ],
  },
  {
    id: 'inventario',
    nombre: 'Inventario',
    desc: 'Stock, almacenes y movimientos',
    icon: 'ti-package',
    color: '#059669', bg: '#ecfdf5', border: '#a7f3d0',
    href: '/dashboard/productos',
    prefixes: ['/dashboard/inventario', '/dashboard/productos', '/dashboard/almacenes', '/dashboard/categorias', '/dashboard/marcas'],
    items: [
      { label: 'Productos',        href: '/dashboard/productos'                   },
      { label: 'Categorías',       href: '/dashboard/categorias'                  },
      { label: 'Almacenes',        href: '/dashboard/almacenes'                   },
      { label: 'Transferencias',   href: '/dashboard/inventario/transferencias'   },
      { label: 'Ajustes de Stock', href: '/dashboard/inventario/ajustes'          },
      { label: 'Recepciones',      href: '/dashboard/inventario/recepciones'      },
    ],
  },
  {
    id: 'credito',
    nombre: 'Crédito y Cobranza',
    desc: 'Créditos, cobros y cartera vencida',
    icon: 'ti-credit-card',
    color: '#d97706', bg: '#fffbeb', border: '#fde68a',
    href: '/dashboard/creditos/creditos',
    prefixes: ['/dashboard/creditos'],
    items: [
      { label: 'Créditos',          href: '/dashboard/creditos/creditos'          },
      { label: 'Cobranza',          href: '/dashboard/creditos/cobranza'          },
      { label: 'Cartera Vencida',   href: '/dashboard/creditos/cartera-vencida'   },
      { label: 'Cuentas Bancarias', href: '/dashboard/creditos/cuentas-bancarias' },
    ],
  },
  {
    id: 'finanzas',
    nombre: 'Finanzas',
    desc: 'Contabilidad y reportes fiscales',
    icon: 'ti-calculator',
    color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe',
    href: '/dashboard/finanzas/polizas',
    prefixes: ['/dashboard/finanzas'],
    items: [
      { label: 'Libro Diario',         href: '/dashboard/finanzas/polizas'              },
      { label: 'Nueva Póliza',         href: '/dashboard/finanzas/polizas/nueva'        },
      { label: 'Balanza',              href: '/dashboard/finanzas/balanza'              },
      { label: 'Estado de Resultados', href: '/dashboard/finanzas/estado-resultados'    },
      { label: 'Balance General',      href: '/dashboard/finanzas/balance-general'      },
      { label: 'Declaración IVA',      href: '/dashboard/finanzas/declaracion-iva'      },
      { label: 'Saldos Iniciales',     href: '/dashboard/finanzas/saldos-iniciales'     },
      { label: 'Cierre Contable',      href: '/dashboard/finanzas/cierre-contable'      },
      { label: 'Cuentas Contables',    href: '/dashboard/finanzas/cuentas-contables'    },
    ],
  },
  {
    id: 'reportes',
    nombre: 'Reportes',
    desc: 'Gerenciales y operativos',
    icon: 'ti-chart-bar',
    color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4',
    href: '/dashboard/reportes',
    prefixes: ['/dashboard/reportes'],
    items: [
      { label: 'Ventas',          href: '/dashboard/reportes/ventas'        },
      { label: 'Inventario',      href: '/dashboard/reportes/inventario'    },
      { label: 'Corte de Caja',   href: '/dashboard/reportes/corte-caja'   },
      { label: 'Top Productos',   href: '/dashboard/reportes/top-productos' },
      { label: 'Estado de Cuenta',href: '/dashboard/reportes/estado-cuenta' },
      { label: 'Dashboard Ejecutivo', href: '/dashboard/reportes/ejecutivo' },
    ],
  },
  {
    id: 'catalogos',
    nombre: 'Catálogos',
    desc: 'Clientes, proveedores y datos maestros',
    icon: 'ti-database',
    color: '#e11d48', bg: '#fff1f2', border: '#fecdd3',
    href: '/dashboard/clientes',
    prefixes: ['/dashboard/clientes', '/dashboard/proveedores', '/dashboard/impuestos', '/dashboard/listas-precio', '/dashboard/marcas', '/dashboard/catalogos'],
    items: [
      { label: 'Clientes',       href: '/dashboard/clientes'              },
      { label: 'Proveedores',    href: '/dashboard/proveedores'           },
      { label: 'Impuestos',      href: '/dashboard/impuestos'             },
      { label: 'Listas de Precio',href: '/dashboard/listas-precio'       },
      { label: 'Bancos',         href: '/dashboard/catalogos/bancos'      },
      { label: 'Formas de Pago', href: '/dashboard/catalogos/formas-pago'},
    ],
  },
  {
    id: 'admin',
    nombre: 'Administración',
    desc: 'Usuarios, roles y permisos',
    icon: 'ti-settings',
    color: '#475569', bg: '#f8fafc', border: '#e2e8f0',
    href: '/dashboard/usuarios',
    prefixes: ['/dashboard/usuarios', '/dashboard/departamentos', '/dashboard/permisos', '/dashboard/configuraciones-aprobacion'],
    items: [
      { label: 'Usuarios',        href: '/dashboard/usuarios'                         },
      { label: 'Departamentos',   href: '/dashboard/departamentos'                    },
      { label: 'Permisos',        href: '/dashboard/permisos'                         },
      { label: 'Aprobaciones',    href: '/dashboard/configuraciones-aprobacion'       },
    ],
  },
];

export function detectarModulo(pathname: string): ModuleConfig | null {
  if (pathname === '/dashboard') return null;
  return MODULOS.find(m => m.prefixes.some(p => pathname.startsWith(p))) ?? null;
}