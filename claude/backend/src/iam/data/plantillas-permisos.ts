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
    rol: 'empleado', // Vendedor de mostrador
    etiqueta: 'Empleado / Vendedor',
    descripcion:
      'Punto de venta, ventas, clientes, CFDI y consulta de productos.',
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
      '/compras/ordenes', // para recibir mercancía (recepciones)
    ],
  },
  {
    rol: 'finanzas', // Contador
    etiqueta: 'Finanzas / Contador',
    descripcion: 'Contabilidad, pólizas, CFDI, crédito y cobranza.',
    prefijos: [
      '/finanzas',
      '/cfdi',
      '/credito',
      '/aprobaciones',
      '/clientes',
      '/proveedores',
      '/catalogo/impuestos',
      '/catalogos/bancos',
      '/catalogos/formas-pago',
    ],
  },
  {
    rol: 'credito',
    etiqueta: 'Crédito',
    descripcion: 'Líneas de crédito, evaluación de clientes y aprobaciones asignadas.',
    prefijos: ['/aprobaciones', '/credito', '/clientes', '/hoteleria/city-ledger'],
  },
  {
    rol: 'cobranza',
    etiqueta: 'Cobranza',
    descripcion: 'Cartera, cobros, City Ledger y aprobaciones asignadas.',
    prefijos: ['/aprobaciones', '/credito', '/clientes', '/hoteleria/city-ledger'],
  },
  {
    rol: 'hoteleria',
    etiqueta: 'Hotelería',
    descripcion: 'Operación hotelera, City Ledger y aprobaciones asignadas.',
    prefijos: ['/aprobaciones', '/hoteleria', '/clientes'],
  },
  /*
   * Gerencia y Dirección aprueban; para aprobar hay que poder ver el
   * expediente. Antes sólo tenían '/aprobaciones', así que autorizaban una
   * línea de crédito sin poder abrir el cliente ni su cartera. Los prefijos
   * de consulta se conceden aquí; el guard de endpoint sigue decidiendo qué
   * verbos se permiten sobre cada ruta.
   */
  {
    rol: 'gerencia',
    etiqueta: 'Gerencia',
    descripcion: 'Bandeja de aprobaciones y consulta ejecutiva de operaciones.',
    prefijos: [
      '/aprobaciones',
      '/clientes',
      '/proveedores',
      '/ventas',
      '/compras',
      '/credito',
      '/catalogo/productos',
      '/catalogo/inventario',
      '/tesoreria',
    ],
  },
  {
    rol: 'direccion',
    etiqueta: 'Dirección',
    descripcion: 'Bandeja de aprobaciones y consulta ejecutiva de operaciones.',
    prefijos: [
      '/aprobaciones',
      '/clientes',
      '/proveedores',
      '/ventas',
      '/compras',
      '/credito',
      '/finanzas',
      '/tesoreria',
      '/rrhh',
    ],
  },
  /*
   * Estos tres roles los EXIGE el código (`exigirRol` en nómina avanzada,
   * `rolAprobador` en las matrices) pero no tenían plantilla, así que aunque
   * se creara el rol no recibía ningún endpoint. El efecto práctico era que
   * sólo el administrador podía dispersar y pagar la nómina, y toda la
   * segregación RRHH → Finanzas → Tesorería quedaba en una sola persona.
   */
  {
    rol: 'tesoreria',
    etiqueta: 'Tesorería',
    descripcion:
      'Caja, bancos, conciliación, dispersión y pago de nómina. NO calcula ni aprueba la nómina.',
    prefijos: [
      '/tesoreria',
      '/caja',
      '/credito/cuentas-bancarias',
      '/rrhh/nomina-avanzada/cuentas-bancarias',
      '/rrhh/nomina-avanzada/periodos',
      '/aprobaciones',
    ],
  },
  {
    rol: 'contador',
    etiqueta: 'Contador',
    descripcion:
      'Contabilidad, cierre, fiscal y cierre de nómina. NO opera caja ni bancos.',
    prefijos: [
      '/finanzas',
      '/cfdi',
      '/catalogo/impuestos',
      '/catalogos/bancos',
      '/catalogos/formas-pago',
      '/activos',
      '/aprobaciones',
    ],
  },
  {
    rol: 'rrhh',
    etiqueta: 'Recursos Humanos',
    descripcion:
      'Plantilla, incidencias, cálculo de nómina y CFDI. NO dispersa ni paga.',
    prefijos: [
      '/rrhh',
      '/departamentos',
      '/aprobaciones',
      '/rpa',
    ],
  },
  {
    rol: 'comprador',
    etiqueta: 'Comprador',
    descripcion: 'Compras, requisiciones, órdenes, cotizaciones y proveedores.',
    prefijos: [
      '/compras',
      '/proveedores',
      '/catalogo/productos',
      '/catalogo/categorias',
      '/catalogo/unidades-medida',
    ],
  },
];
