// iam/data/plantillas-permisos.ts
// ═══════════════════════════════════════════════════════════════════════
// Plantillas de permisos por rol, basadas en las RUTAS REALES de tu tabla
// de endpoints. Cada rol activa los endpoints cuya ruta empiece por alguno
// de sus prefijos.
//
// ⚠️ VERIFICA LOS NOMBRES DE ROL: deben coincidir EXACTAMENTE con los de tu
// sistema. Según tu pantalla: empleado, comprador, almacenista, finanzas.
// Si en BD están capitalizados o distintos, ajústalos en el campo "rol".
// ═══════════════════════════════════════════════════════════════════════

export interface PlantillaRol {
  rol: string;
  etiqueta: string;
  descripcion: string;
  prefijos: string[];
}

export const PLANTILLAS_PERMISOS: PlantillaRol[] = [
  {
    rol: 'empleado',            // Vendedor de mostrador
    etiqueta: 'Empleado / Vendedor',
    descripcion: 'Punto de venta, ventas, clientes, CFDI y consulta de productos.',
    prefijos: [
      '/ventas',
      '/clientes',
      '/cfdi',
      '/catalogo/productos',
      '/catalogo/categorias',
      '/catalogo/marcas',
      '/catalogo/unidades-medida',
      '/catalogo/listas-precio',
      '/catalogo/impuestos',
      '/catalogos/formas-pago',
    ],
  },
  {
    rol: 'almacenista',
    etiqueta: 'Almacenista',
    descripcion: 'Inventario, productos, recepciones y ajustes de stock.',
    prefijos: [
      '/catalogo/productos',
      '/catalogo/categorias',
      '/catalogo/marcas',
      '/catalogo/unidades-medida',
      '/catalogo/almacenes',
      '/catalogo/inventario',
      '/compras/ordenes',        // para recibir mercancía (recepciones)
    ],
  },
  {
    rol: 'finanzas',            // Contador
    etiqueta: 'Finanzas / Contador',
    descripcion: 'Contabilidad, pólizas, CFDI, crédito y cobranza.',
    prefijos: [
      '/finanzas',
      '/cfdi',
      '/credito',
      '/clientes',
      '/proveedores',
      '/catalogo/impuestos',
      '/catalogos/bancos',
      '/catalogos/formas-pago',
    ],
  },
  {
    rol: 'comprador',
    etiqueta: 'Comprador',
    descripcion: 'Compras, requisiciones, órdenes, cotizaciones y proveedores.',
    prefijos: [
      '/compras',
      '/configuraciones-aprobacion',
      '/proveedores',
      '/catalogo/productos',
      '/catalogo/categorias',
      '/catalogo/unidades-medida',
    ],
  },
];