// iam/data/plantillas-permisos.ts
/**
 * ============================================================================
 * Qué le toca a cada rol, expresado en MÓDULOS
 * ----------------------------------------------------------------------------
 * Antes esto era una lista de prefijos de ruta por rol: `/catalogo/productos`,
 * `/catalogo/categorias`, `/catalogo/marcas`… Nueve líneas para decir «el
 * almacenista maneja el almacén», y cada vez que nacía una ruta nueva en ese
 * árbol había que acordarse de agregarla a mano en cada rol que la necesitara.
 * Nadie se acuerda. Por eso había roles con plantilla escrita que en la
 * práctica no cubrían pantallas enteras.
 *
 * Ahora se declara lo que de verdad se quiere decir: **un rol atiende unos
 * módulos**. El módulo se define una sola vez en `modulos-catalogo.ts` y
 * absorbe solo las rutas nuevas que caigan dentro de él.
 *
 *  · `modulos`         → puede hacer TODO lo del módulo: ver, crear,
 *                        modificar y eliminar.
 *  · `modulosConsulta` → solo lectura. Únicamente los GET del módulo.
 *
 * La distinción no es un adorno. Un vendedor necesita ver el catálogo de
 * productos para vender; no necesita poder borrarlo. Conceder el módulo
 * completo «porque lo usa» es exactamente como se acaba con un cajero que
 * puede cerrar el periodo contable.
 *
 * Esto es una SUGERENCIA, no una jaula: la pantalla de roles permite subir o
 * bajar cualquier módulo después, y el ajuste fino por acción sigue existiendo
 * para los casos raros.
 *
 * `admin` no está aquí a propósito: no pasa por la tabla de permisos, lo
 * reconoce `esRolAdministrador()` y entra a todo.
 * ============================================================================
 */

export interface PlantillaRol {
  rol: string;
  etiqueta: string;
  descripcion: string;
  /** Módulos que el rol atiende por completo. */
  modulos: string[];
  /** Módulos que solo consulta (nada más los GET). */
  modulosConsulta?: string[];
  /**
   * Acciones que el rol SIEMPRE tiene, pase lo que pase. `METODO /ruta`.
   *
   * No es lo mismo que conceder el módulo: un endpoint puede cambiar de módulo
   * —la recepción de mercancía se reclasificó de «Compras» a «Inventario»— y
   * las instancias ya sembradas se quedan con el permiso apagado, porque nadie
   * vuelve a correr la plantilla. Aquí se declara por ruta, que es lo que no
   * cambia, y el servicio lo repone en cada escritura.
   */
  accionesIrrenunciables?: string[];
  /**
   * Acciones que el rol NUNCA tiene, aunque su módulo se conceda completo.
   * Es el techo, simétrico al piso: existe para la separación de funciones,
   * donde el daño no es no poder trabajar sino poder hacer dos trabajos que
   * deben vigilarse entre sí.
   */
  accionesVedadas?: string[];
  /**
   * Módulos que el rol NUNCA tiene, ni completos ni en consulta.
   *
   * Existe por una asimetría que se descubre tarde: quitar un módulo de la
   * plantilla no retira nada en las empresas ya sembradas. La reconciliación
   * de arranque sólo enciende —nunca apaga— para que una ampliación hecha a
   * mano sobreviva al reinicio, y eso es correcto; pero entonces un módulo
   * que se le retira a un rol se le queda encendido para siempre, y sólo se
   * nota mirando la matriz una por una. Aquí se declara la retirada, que es
   * la única forma de que ocurra y de que quede escrita.
   *
   * Listar cada acción en `accionesVedadas` haría lo mismo, pero a mano y
   * desactualizándose en cuanto naciera un endpoint más dentro del módulo.
   */
  modulosVedados?: string[];
}

/**
 * Lo que necesita la pantalla de espejo contable. Vive aparte porque la
 * comparten contador y finanzas y repetirla a mano es como se desincronizan.
 */
const ACCIONES_ESPEJO_CONTABLE = [
  'GET /integracion/estado',
  'GET /integracion/cuentas/pendientes',
  'GET /integracion/cuentas/previstas',
  'GET /integracion/cuentas/externas',
  'GET /integracion/cuentas/mapeo',
  'POST /integracion/cuentas/mapeo',
  'POST /integracion/cuentas/aprovisionar',
  'GET /integracion/outbox',
  'POST /integracion/outbox/:id/reencolar',
  'POST /integracion/outbox/despachar',
];

export const PLANTILLAS_PERMISOS: PlantillaRol[] = [
  {
    rol: 'empleado',
    etiqueta: 'Empleado / Vendedor',
    descripcion: 'Mostrador: vende, cobra, factura y da de alta clientes.',
    modulos: ['ventas', 'clientes', 'facturacion', 'caja'],
    modulosConsulta: ['inventario', 'precios', 'credito'],
    /*
     * El mostrador necesita saber si un cliente tiene crédito y cuánto debe.
     * No necesita las cuentas bancarias de la empresa, que viven en el mismo
     * módulo y se colaban con la consulta: números de cuenta y CLABE a la
     * vista de quien atiende al público, sin que nadie lo decidiera.
     */
    accionesVedadas: ['GET /credito/cuentas-bancarias'],
  },
  {
    rol: 'almacenista',
    etiqueta: 'Almacenista',
    descripcion:
      'El almacén entero: productos, existencias, movimientos, WMS y recepción de mercancía.',
    /*
     * Sin «recetas». El módulo es el escandallo del restaurante del hotel —de
     * qué se compone una margarita, cuánto cuesta servirla— y lo tenía el
     * almacenista porque la explosión de insumos descuenta inventario. Pero
     * quien surte el almacén no prepara hamburguesas: el consumo se lo reporta
     * la cocina, no lo define él. Es de Hotelería, que ya lo tiene.
     */
    /*
     * «almacenes» se separo de «inventario» el 21-sep-2026: el primero es el
     * trabajo fisico —recibir, ubicar, mover, contar, mermar— y el segundo el
     * maestro de productos. El almacenista es el unico rol operativo que
     * necesita los dos completos.
     */
    modulos: ['inventario', 'almacenes'],
    /*
     * Sin «precios». El módulo trae las listas de precio y el catálogo de
     * impuestos, y ninguna de las dos cosas es del almacén: quien acomoda
     * mercancía no fija el precio de venta ni decide el IVA aplicable. Lo que
     * hacía era encenderle un cuadro de «Catálogos» cuyo único renglón era
     * «Impuestos», y poner en la ficha del producto un desplegable fiscal que
     * él no debe tocar. Si le hiciera falta ver el costo, ése viaja en la
     * orden de compra, que sí consulta.
     */
    modulosConsulta: ['compras', 'proveedores'],
    /*
     * `finanzas` entra aquí aunque el almacenista nunca lo haya tenido como
     * módulo. La razón: el asistente de recetas (`/recetas/wizard`) y el
     * costeo (`/recetas/costos`) colgaban de `/recetas`, que sí es suyo, y se
     * reclasificaron a Contabilidad. Reclasificar no retira lo ya concedido,
     * así que seguía pudiendo sembrar el catálogo de cuentas entero y
     * recalcular el costo teórico. Vedar el módulo lo retira hoy y cubre
     * cualquier endpoint que nazca ahí mañana.
     */
    modulosVedados: ['precios', 'finanzas', 'recetas'],
    /*
     * Dar entrada a la mercancía ES el trabajo del almacenista. Cuelga de la
     * ruta de compras y por eso vivió un tiempo en el módulo «Compras», del
     * que este rol solo tiene consulta: veía el manifiesto, capturaba todo con
     * el camión enfrente y al firmar recibía un 403. Se reclasificó a
     * inventario, pero las instancias sembradas antes se quedaron con la
     * acción apagada —78 de 79— y nadie lo nota hasta que llega un camión.
     */
    accionesIrrenunciables: [
      'PATCH /compras/ordenes/:id/recibir',
      'GET /compras/ordenes/recepciones',
      'GET /compras/ordenes/:id',
      /*
       * Levantar la requisición ES trabajo del almacén, y es el único rol que
       * se entera a tiempo: el comprador no ve el anaquel vacío, lo ve quien
       * surte. En todo ERP serio el almacén solicita y compras adjudica.
       *
       * Faltaba. «Compras» se le da en consulta —correcto: no adjudica, no
       * cotiza, no paga— y eso se llevó también el alta de la requisición. La
       * pantalla le ofrecía «Nueva requisición» en un botón primario y el
       * vacío le decía «crea tu primera requisición»; llenaba el formulario y
       * al guardar recibía un 403, con el trabajo perdido.
       *
       * Sólo el alta y el seguimiento de las suyas. Resolver aprobaciones
       * sigue vedado más abajo: quien pide no se autoriza a sí mismo.
       */
      'POST /compras/requisiciones',
      'GET /compras/requisiciones',
      'GET /compras/requisiciones/:id',
    ],
    /*
     * El catálogo de categorías es suyo: las crea, las renombra, las cuelga de
     * un padre, las da de baja. Lo que no es suyo son las cinco cuentas
     * contables de cada una —ventas, costo, inventario, devoluciones, mermas—,
     * que deciden a qué cuenta aterriza cada venta y cada salida de almacén.
     * Se mudaron a `/catalogo/categorias/:id/cuentas`, dentro de Contabilidad,
     * pero la reclasificación por sí sola no apaga lo ya concedido en las
     * empresas sembradas antes: `auto-configurar` seguía encendido aquí. Se
     * declara vedado, que es la única forma de retirar algo y que se note.
     */
    accionesVedadas: [
      'PATCH /catalogo/categorias/:id/cuentas',
      'POST /catalogo/categorias/auto-configurar',
      /*
       * Quien pide no se autoriza. La consulta de compras le dejaba ver la
       * bandeja de aprobaciones de requisición —una pantalla que le dice
       * «revisa y autoriza las requisiciones de tu equipo» y que él no puede
       * usar—, y ahora que levanta requisiciones, dejársela a la vista es
       * invitar a que alguien se la conceda «porque ya la ve».
       */
      'GET /compras/requisiciones/aprobaciones/pendientes',
      'PATCH /compras/requisiciones/aprobaciones/:id',
    ],
  },
  {
    rol: 'comprador',
    etiqueta: 'Comprador',
    descripcion: 'Requisiciones, cotizaciones, órdenes de compra y padrón de proveedores.',
    modulos: ['compras', 'proveedores'],
    /*
     * Consulta de inventario SIN el almacen. Necesita saber que hay en
     * existencia para comprar con criterio; no necesita conteos fisicos,
     * ubicaciones, reubicaciones ni la integridad de posiciones, que son la
     * operacion interna de otra area. Antes recibia las 14 lecturas del WMS
     * porque «almacenes» no existia como modulo y todo caia en «inventario».
     *
     * Lo que si conserva del almacen va por accion, no por modulo:
     * GET /compras/ordenes/recepciones, para dar seguimiento al proveedor.
     */
    modulosConsulta: ['inventario', 'precios', 'aprobaciones'],
    /*
     * Separación de funciones. El módulo «Compras» completo le entregaba
     * también el pago al proveedor y la resolución de aprobaciones de
     * requisición: el mismo usuario podía levantar la requisición,
     * autorizársela, adjudicar, generar la orden y pagarla. Comprar, autorizar
     * y pagar en una sola persona es el hallazgo que cualquier auditoría
     * marca primero, y no se arregla con disciplina sino quitando el permiso.
     *
     * Falta la cuarta: RECIBIR. Quien ordena no da por recibida su propia
     * compra. Es el fraude de compras más sencillo que existe —ordenar de más,
     * declararlo recibido y que nadie cuente la caja— y por eso ningún ERP
     * serio deja comprar y recepcionar en el mismo usuario. En SUMA recibe el
     * almacenista, que es quien tiene la mercancía enfrente: para él
     * `PATCH /compras/ordenes/:id/recibir` es irrenunciable, y aquí es vedada.
     *
     * El comprador conserva la CONSULTA de recepciones
     * (`GET /compras/ordenes/recepciones`): necesita saber qué llegó y qué no
     * para dar seguimiento al proveedor. Ver no es dar por recibido.
     */
    /*
     * Al mudarse la recepcion al modulo «almacenes», esta lectura dejo de
     * llegarle por modulo. Se declara por accion porque no es opcional: sin
     * ella el comprador no sabe que llego y que no, y el seguimiento al
     * proveedor se hace por telefono.
     */
    accionesIrrenunciables: ['GET /compras/ordenes/recepciones'],
    accionesVedadas: [
      'PATCH /compras/ordenes/:id/pagar',
      'PATCH /compras/requisiciones/aprobaciones/:id',
      'PATCH /compras/ordenes/:id/recibir',
      /*
       * Sin facultad de resolver, la bandeja sobra. La pantalla dice "Revisa y
       * autoriza las requisiciones de compra de tu equipo" y para el comprador
       * estaba condenada a salir siempre vacia, porque solo lista lo asignado a
       * uno y el que no puede firmar nunca tiene nada asignado. Un renglon de
       * menu que promete autoridad que no se tiene ensucia el area de trabajo y
       * hace dudar del resto.
       */
      'GET /compras/requisiciones/aprobaciones/pendientes',
    ],
  },
  {
    rol: 'finanzas',
    etiqueta: 'Finanzas',
    descripcion: 'Contabilidad, tesorería, facturación, activos y catálogos financieros.',
    modulos: [
      'finanzas',
      'tesoreria',
      'facturacion',
      'activos',
      'catalogos',
      'precios',
      'aprobaciones',
    ],
    modulosConsulta: ['ventas', 'compras', 'clientes', 'proveedores', 'credito', 'caja'],
    /*
     * Alguien tiene que poder pagarle al proveedor. El pago cuelga de
     * `/compras`, que a este rol se le da solo en consulta, y al comprador se
     * le vedó por separación de funciones: sin esta línea, tras cerrar ese
     * hueco no quedaba en toda la empresa un rol capaz de pagar salvo el
     * administrador. Quien recibe la mercancía no paga, quien compra no paga:
     * paga tesorería, contra lo que el almacén dio por recibido.
     */
    accionesIrrenunciables: [
      'PATCH /compras/ordenes/:id/pagar',
      // La acción sin la consulta no sirve: la pantalla de pago abre vacía si
      // no puede listar ni abrir la orden. Pasó con el almacenista —podía ver
      // el manifiesto y no firmarlo— y aquí al revés: podía firmar el pago y
      // no ver qué pagar.
      'GET /compras/ordenes',
      'GET /compras/ordenes/:id',
      // Mapear categorías a cuentas contables: la acción es de Contabilidad,
      // la lista que hay que mapear es de Inventario.
      'GET /catalogo/categorias',
    /*
     * El espejo contable —`/dashboard/finanzas/espejo-contable`—. Sus acciones
     * cuelgan de `/integracion`, un módulo marcado como sensible porque da
     * poder sobre la conexión con el core, así que no se concede entero. Pero
     * lo que esa pantalla hace es contabilidad: ver qué cuentas no tienen
     * equivalencia del otro lado, corresponderlas, y reencolar las pólizas que
     * no llegaron. Si el contador no puede, nadie lo mira hasta que la balanza
     * del ERP y la de Fineract dejan de coincidir.
     */
    ...ACCIONES_ESPEJO_CONTABLE,
    ],
  },
  {
    rol: 'contador',
    etiqueta: 'Contador',
    descripcion: 'Pólizas, cierres, CFDI, activos y catálogos SAT.',
    modulos: ['finanzas', 'facturacion', 'activos', 'catalogos'],
    modulosConsulta: ['ventas', 'compras', 'tesoreria', 'precios', 'caja', 'aprobaciones'],
    /*
     * Decidir a qué cuenta va cada familia de productos es trabajo suyo, y la
     * pantalla donde se hace necesita listar las categorías. Las categorías
     * son del módulo de Inventario, que este rol no tiene ni en consulta: sin
     * esta línea la pantalla abre vacía y no hay nada que mapear. Es la misma
     * regla de siempre —quien ejecuta también puede ver— aplicada al revés que
     * en el almacén.
     */
    accionesIrrenunciables: [
      'GET /catalogo/categorias',
    /*
     * El espejo contable —`/dashboard/finanzas/espejo-contable`—. Sus acciones
     * cuelgan de `/integracion`, un módulo marcado como sensible porque da
     * poder sobre la conexión con el core, así que no se concede entero. Pero
     * lo que esa pantalla hace es contabilidad: ver qué cuentas no tienen
     * equivalencia del otro lado, corresponderlas, y reencolar las pólizas que
     * no llegaron. Si el contador no puede, nadie lo mira hasta que la balanza
     * del ERP y la de Fineract dejan de coincidir.
     */
    ...ACCIONES_ESPEJO_CONTABLE,
    ],
  },
  {
    rol: 'tesoreria',
    etiqueta: 'Tesorería',
    descripcion: 'Saldos, movimientos, traspasos, conciliación bancaria y caja.',
    modulos: ['tesoreria', 'caja', 'aprobaciones'],
    // Quien paga tiene que poder ver qué paga y a quién: la orden de compra y
    // el padrón de proveedores, en consulta.
    modulosConsulta: ['finanzas', 'credito', 'catalogos', 'compras', 'proveedores'],
    /*
     * Alguien tiene que poder pagarle al proveedor. El pago cuelga de
     * `/compras`, que a este rol se le da solo en consulta, y al comprador se
     * le vedó por separación de funciones: sin esta línea, tras cerrar ese
     * hueco no quedaba en toda la empresa un rol capaz de pagar salvo el
     * administrador. Quien recibe la mercancía no paga, quien compra no paga:
     * paga tesorería, contra lo que el almacén dio por recibido.
     */
    accionesIrrenunciables: [
      'PATCH /compras/ordenes/:id/pagar',
      // La acción sin la consulta no sirve: la pantalla de pago abre vacía si
      // no puede listar ni abrir la orden. Pasó con el almacenista —podía ver
      // el manifiesto y no firmarlo— y aquí al revés: podía firmar el pago y
      // no ver qué pagar.
      'GET /compras/ordenes',
      'GET /compras/ordenes/:id',
    ],
  },
  {
    rol: 'credito',
    etiqueta: 'Crédito',
    descripcion: 'Línea de crédito, verificación del cliente y originación.',
    modulos: ['credito', 'clientes', 'aprobaciones'],
    modulosConsulta: ['ventas', 'facturacion', 'integracion'],
    /*
     * De la integración con el core le toca lo suyo: la disponibilidad del
     * cliente y los avisos. La correspondencia de cuentas contra el mayor
     * externo es contabilidad, y con la consulta del módulo se le colaba: le
     * encendía un cuadro de «Finanzas» cuyo único renglón era el espejo
     * contable.
     */
    accionesVedadas: [
      'GET /integracion/cuentas/pendientes',
      'GET /integracion/cuentas/previstas',
      'GET /integracion/cuentas/externas',
      'GET /integracion/cuentas/mapeo',
    ],
  },
  {
    rol: 'cobranza',
    etiqueta: 'Cobranza',
    descripcion: 'Cartera, cobros, estados de cuenta y city ledger.',
    modulos: ['credito', 'clientes'],
    modulosConsulta: ['ventas', 'facturacion', 'caja', 'hoteleria'],
  },
  {
    rol: 'hoteleria',
    etiqueta: 'Hotelería',
    descripcion:
      'Operación del hotel: disponibilidad, ama de llaves, city ledger, recetas y auditoría nocturna.',
    modulos: ['hoteleria', 'recetas', 'clientes', 'aprobaciones'],
    modulosConsulta: ['inventario', 'ventas'],
  },
  {
    rol: 'rrhh',
    etiqueta: 'Recursos Humanos',
    descripcion: 'Empleados, puestos, asistencia, incidencias, vacaciones, nómina y departamentos.',
    modulos: ['rrhh', 'aprobaciones'],
    modulosConsulta: ['tablero'],
  },
  {
    rol: 'gerencia',
    etiqueta: 'Gerencia',
    descripcion: 'Aprueba y mira todo lo operativo, sin tocar la configuración del sistema.',
    modulos: ['aprobaciones', 'tablero'],
    modulosConsulta: [
      'ventas',
      'clientes',
      'compras',
      'proveedores',
      'credito',
      'inventario',
      'almacenes',
      'precios',
      'finanzas',
      'tesoreria',
      'caja',
      'crm',
      'rrhh',
      'hoteleria',
      'facturacion',
      'activos',
    ],
  },
  {
    rol: 'direccion',
    etiqueta: 'Dirección',
    descripcion: 'Lo mismo que gerencia, más la lectura de la integración con el core.',
    modulos: ['aprobaciones', 'tablero'],
    modulosConsulta: [
      'ventas',
      'clientes',
      'compras',
      'proveedores',
      'credito',
      'inventario',
      'almacenes',
      'precios',
      'catalogos',
      'recetas',
      'finanzas',
      'tesoreria',
      'caja',
      'activos',
      'crm',
      'rrhh',
      'hoteleria',
      'facturacion',
      'integracion',
    ],
  },
];
