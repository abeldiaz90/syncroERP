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
/*
 * ============================================================================
 * La nomina la firman varios, y cada uno necesita con que firmarla
 * ----------------------------------------------------------------------------
 * `FIRMAS_NOMINA` (en `rrhh/advanced/matriz-de-firmas.ts`) reparte la cadena
 * de nomina: Recursos humanos prepara, Tesoreria dispersa y paga, Finanzas y
 * Contabilidad configuran, contabilizan y cierran. El guardia de roles ya la
 * aplica en la puerta.
 *
 * Pero el guardia solo puede negar. Quien deja pasar es la tabla de permisos,
 * y `/rrhh/nomina-avanzada` cuelga del modulo `rrhh`, que ni Tesoreria ni
 * Finanzas ni Contabilidad tienen —ni deben tener: el modulo entero incluye la
 * plantilla, los sueldos y los recibos.
 *
 * El resultado era una cadena rota por los dos extremos: el sistema le
 * encargaba a Tesoreria dispersar la nomina y no la dejaba abrir la pantalla.
 * Es el mismo error que ya se corrigio en compras —«podia firmar el pago y no
 * ver que pagar»— repetido aqui.
 *
 * Asi que se conceden las acciones exactas de cada firma, y solo esas. Cada
 * GET acompana a su accion porque una pantalla que no puede listar abre vacia.
 * Lo que sigue fuera de alcance para estos tres roles es lo de siempre: la
 * plantilla, los recibos, la prenomina y el detalle de percepciones.
 * ============================================================================
 */

/** Tesoreria: cuentas de los empleados, dispersion y pago. */
/**
 * Firmar la nomina: lo minimo para poder decidir, y nada mas.
 *
 * Quien firma un nivel de la cadena tiene que ver que firma, o estamos en el
 * error de siempre —«podia firmar el pago y no ver que pagar»—. Pero «ver que
 * firma» no es lo mismo para cada etapa. Gerencia autoriza la nomina por sus
 * TOTALES: cuantos trabajadores, cuanto de percepciones, cuanto de neto. Esa
 * es su decision. La prenomina trabajador por trabajador le sigue vedada, y el
 * recibo tambien, porque el sueldo de cada quien no es asunto de esa firma.
 */
/*
 * El padron —numero, nombre y estado, nada mas— es lo minimo para poder
 * referirse a un empleado en un selector. No es el expediente: ni sueldo, ni
 * datos fiscales, ni cuenta bancaria. Lo necesita quien captura una cuenta,
 * registra un prestamo o revisa una dispersion sin tener RRHH.
 */
const ACCION_PADRON = 'GET /rrhh/padron';

/**
 * ============================================================================
 * Las dos autorizaciones del almacén que nadie podía dar
 * ----------------------------------------------------------------------------
 * El inventario tiene dos controles de cuatro ojos, los dos correctos y los dos
 * escritos con todas sus letras en `wms.service.ts`:
 *
 *   «La autorización del ajuste debe realizarla una persona distinta de quien
 *    abrió o capturó el conteo.»
 *   «Quien solicita la transferencia no puede autorizarla.»
 *
 * Y las dos acciones —`PATCH /catalogo/wms/conteos/:id/cerrar` y
 * `PATCH /catalogo/wms/transferencias/:id/autorizar`— cuelgan del módulo
 * `almacenes`, que sólo tiene el almacenista. O sea: la única persona que puede
 * autorizar es la misma que abrió el conteo y solicitó la transferencia.
 *
 * Medido el 25-sep-2026 contra la instalación: se abre un conteo cíclico, se
 * captura, queda en PENDIENTE_AUTORIZACION, y entonces
 *
 *   almacenista → 400 «debe realizarla una persona distinta»
 *   comprador, gerencia, finanzas, contador, tesorería → 403
 *
 * El conteo se queda ahí para siempre. En una empresa con un solo almacenista
 * —el caso normal— NINGÚN conteo físico puede cerrarse y NINGUNA transferencia
 * entre almacenes puede autorizarse. El control no es estricto: es imposible.
 *
 * Es la misma historia que la primera firma de la nómina, unas líneas más
 * abajo: la regla estaba bien y la población de firmantes era de uno.
 *
 * Autorizar el ajuste de un inventario y el movimiento entre almacenes es una
 * función de supervisión —en SAP y en Business Central la firma el jefe de
 * almacén o el controller, nunca el operario que contó—, así que va a
 * `gerencia` y `direccion`, que aprueban y no capturan. Por ACCIÓN y no por
 * módulo: ver el ajuste que se autoriza no es tener el almacén.
 * ============================================================================
 */
const ACCIONES_AUTORIZAR_ALMACEN = [
  // Lo que se autoriza: el conteo, sus diferencias y la transferencia.
  'GET /catalogo/wms/conteos',
  'GET /catalogo/wms/conteos/:id',
  'PATCH /catalogo/wms/conteos/:id/cerrar',
  'GET /catalogo/wms/transferencias',
  'PATCH /catalogo/wms/transferencias/:id/autorizar',
];

/**
 * ============================================================================
 * Autorizar una compra y autorizar unas vacaciones son funciones de mando
 * ----------------------------------------------------------------------------
 * Dos trampas más de la misma familia, medidas el 25-sep-2026:
 *
 * REQUISICIONES. `gerencia` VE la bandeja de requisiciones pendientes —200— y
 * al resolver recibe 403. Es la peor variante: la pantalla aparece, el
 * documento se lista, y el botón no puede. Y no es hipotético: el servicio que
 * crea la ruta de aprobación de cada área nueva elige al aprobador por orden de
 * mando —`['gerencia','direccion','admin']`— porque «autorizar una compra es
 * una función de mando y no se le puede endosar a quien pase por ahí». O sea
 * que la próxima área que se cree apunta a alguien que no puede firmar.
 *
 * Hoy sólo `contador` resuelve requisiciones. Además de dejar al mando fuera,
 * junta autorizar y registrar en las mismas manos, que es el par clásico.
 *
 * VACACIONES. Sólo `rrhh` puede pedirlas y sólo `rrhh` puede resolverlas, y el
 * servicio exige —con razón— que quien solicita no apruebe. Con una sola
 * persona de Recursos humanos, ninguna solicitud de vacaciones se resuelve
 * jamás. En cualquier ERP la vacación la autoriza el jefe, no el departamento
 * que la tramita.
 *
 * Las dos van a `gerencia` y `direccion`, por ACCIÓN: aprobar una requisición
 * no es tener Compras, y autorizar unas vacaciones no es tener RRHH.
 * ============================================================================
 */
/**
 * El tablero de operaciones pendientes.
 *
 * Devuelve CUENTAS —«3 requisiciones pendientes», «2 conteos abiertos»—, no
 * documentos ni importes, y cada línea nombra al responsable y enlaza a la
 * pantalla donde se resuelve. Colgaba de `/configuracion`, que es de
 * administración, así que los nueve roles operativos recibían 403: el único
 * que podía abrirlo era el único que no aparece como responsable de ninguna
 * de sus líneas.
 */
const ACCION_TABLERO_PENDIENTES = 'GET /configuracion/pendientes';

const ACCIONES_AUTORIZAR_OPERACION = [
  // La requisición: verla en la bandeja y poder resolverla.
  'GET /compras/requisiciones/aprobaciones/pendientes',
  /*
   * Y ABRIRLA. La bandeja lista folio, solicitante e importe; las partidas
   * —qué se pide, cuánto y para qué— están en el detalle, que es la pantalla
   * a la que lleva el propio botón. Sin esta acción, `gerencia` recibía un 403
   * al abrirla y podía resolverla igual: autorizar a ciegas, que es peor que
   * no poder autorizar, porque no deja rastro de que faltaba un permiso.
   */
  'GET /compras/requisiciones/:id',
  'PATCH /compras/requisiciones/aprobaciones/:id',
  // Las vacaciones de su gente.
  'GET /rrhh/vacaciones/solicitudes',
  'PATCH /rrhh/vacaciones/solicitudes/:id/resolver',
];

const ACCIONES_FIRMAR_NOMINA = [
  // Los totales del periodo: lo que se autoriza.
  'GET /rrhh/nomina/periodos',
  'GET /rrhh/nomina-avanzada/periodos/:id/aprobaciones',
  'PATCH /rrhh/nomina-avanzada/aprobaciones/:id',
];

const ACCIONES_NOMINA_TESORERIA = [
  ACCION_PADRON,
  // Sin el listado de periodos no hay de donde elegir que dispersar.
  'GET /rrhh/nomina/periodos',
  'GET /rrhh/nomina-avanzada/tablero',
  'GET /rrhh/nomina-avanzada/cuentas-bancarias',
  'POST /rrhh/nomina-avanzada/cuentas-bancarias',
  'PATCH /rrhh/nomina-avanzada/cuentas-bancarias/:id',
  'PATCH /rrhh/nomina-avanzada/cuentas-bancarias/:id/validar',
  'POST /rrhh/nomina-avanzada/cuentas-bancarias/migrar-cifrado',
  'GET /rrhh/nomina-avanzada/periodos/:id/dispersion',
  'POST /rrhh/nomina-avanzada/periodos/:id/dispersion',
  'PATCH /rrhh/nomina-avanzada/periodos/:id/dispersion/enviada',
  'PATCH /rrhh/nomina-avanzada/periodos/:id/dispersion/conciliar',
  'GET /rrhh/nomina-avanzada/periodos/:id/pago',
  'POST /rrhh/nomina-avanzada/periodos/:id/pago',
];

/** Finanzas y Contabilidad: identidad patronal, poliza y cierre. */
const ACCIONES_NOMINA_CONTABILIDAD = [
  'GET /rrhh/nomina/periodos',
  'GET /rrhh/nomina-avanzada/tablero',
  // La configuracion patronal: RFC, registro IMSS, prima de riesgo, mapa
  // contable, PAC. Sin ella la nomina no se puede calcular, y hasta hoy el
  // unico que podia guardarla era el administrador, porque el rol que tenia
  // la pantalla en su menu no tenia el permiso.
  'GET /rrhh/nomina-avanzada/configuracion',
  'POST /rrhh/nomina-avanzada/configuracion',
  'GET /rrhh/nomina-avanzada/periodos/:id/poliza-detallada',
  'POST /rrhh/nomina-avanzada/periodos/:id/poliza-detallada',
  'POST /rrhh/nomina-avanzada/periodos/:id/cierre-financiero',
  'GET /rrhh/nomina-avanzada/periodos/:id/cumplimiento',
  /*
   * La cuenta contable de cada concepto de nomina. El concepto lo define
   * Recursos humanos; a que cuenta va el gasto lo define quien lleva la
   * contabilidad, igual que el mapa patronal. Necesita leer la lista para
   * poder asignarla.
   */
  'GET /rrhh/conceptos',
  'PATCH /rrhh/conceptos/:id/cuenta-contable',
];

/** Solo Finanzas: prestamos, obligaciones y la validacion de cuentas. */
const ACCIONES_NOMINA_FINANZAS = [
  ACCION_PADRON,
  'GET /rrhh/nomina-avanzada/prestamos',
  'POST /rrhh/nomina-avanzada/prestamos',
  'GET /rrhh/nomina-avanzada/obligaciones',
  'POST /rrhh/nomina-avanzada/obligaciones',
  /*
   * Validar la cuenta bancaria de un empleado es un control, y un control que
   * ejerce quien capturo el dato no controla nada. RRHH y Tesoreria capturan;
   * Finanzas puede validar. Por eso necesita leer la lista.
   */
  'GET /rrhh/nomina-avanzada/cuentas-bancarias',
  'PATCH /rrhh/nomina-avanzada/cuentas-bancarias/:id/validar',
];

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
  /*
   * Contrastar los dos mayores. Sin estas dos, la pantalla ensena que la
   * poliza salio y nadie comprueba nunca que del otro lado haya aterrizado lo
   * mismo. Es la pregunta que justifica todo el espejo.
   */
  'GET /integracion/contabilidad/conciliacion',
  'POST /integracion/contabilidad/conciliacion/ejecutar',
];

export const PLANTILLAS_PERMISOS: PlantillaRol[] = [
  {
    rol: 'empleado',
    etiqueta: 'Empleado / Vendedor',
    descripcion:
      'Mostrador: vende, cobra, factura, da de alta clientes y lleva su cartera comercial.',
    /*
     * ────────────────────────────────────────────────────────────────────────
     * Un modulo que nadie podia usar
     * ------------------------------------------------------------------------
     * CRM —prospectos, oportunidades, pipeline y agenda— solo lo tenian
     * gerencia y direccion, y en CONSULTA. Resultado: las tres pantallas
     * existian, salian en el menu de esos dos roles, y sus botones —«Nueva
     * oportunidad», «Registrar actividad», mover una etapa— contestaban 403 a
     * todo el mundo. Un modulo entero que ningun puesto podia trabajar.
     *
     * Se le da al mostrador, que es el puesto comercial de esta instalacion y
     * el unico que habla con el prospecto: en cualquier ERP moderno el CRM es
     * de Ventas. Gerencia y direccion lo conservan en consulta, que es lo que
     * les toca: mirar el embudo, no llenarlo.
     * ────────────────────────────────────────────────────────────────────────
     */
    modulos: ['ventas', 'clientes', 'facturacion', 'caja', 'crm'],
    modulosConsulta: ['inventario', 'precios', 'credito'],
    /*
     * El mostrador necesita saber si un cliente tiene crédito y cuánto debe.
     * No necesita las cuentas bancarias de la empresa, que viven en el mismo
     * módulo y se colaban con la consulta: números de cuenta y CLABE a la
     * vista de quien atiende al público, sin que nadie lo decidiera.
     */
    /*
     * La lista corta de cajas por las que puede cobrar: nombre y tipo, sin
     * CLABE ni número de cuenta. Sin ella el desplegable del mostrador salía
     * vacío —la pantalla traga el 403— y ninguna venta de contado podía
     * cerrarse: el punto de venta exige elegir caja en todo cobro inmediato.
     */
    /*
     * Y la lista corta de almacenes: nombre e identificador, nada mas. El
     * mostrador no puede leer `GET /catalogo/almacenes` —trae direccion,
     * responsable y configuracion de cada bodega—, la caja se quedaba con la
     * lista vacia porque tragaba el 403, y sin almacen el boton «Cobrar»
     * quedaba apagado para siempre y sin explicacion. El unico rol que puede
     * vender era el unico que no podia cerrar una venta desde la pantalla.
     */
    /*
     * Las cinco entradas que la caja consulta al abrir, declaradas. Que
     * funcionen hoy por herencia de modulo no basta: un veto futuro —o un
     * modulo que se reordena— apaga el boton «Cobrar» sin que nadie relacione
     * una cosa con la otra. Aqui son explicitas, y una prueba compara esta
     * lista contra lo que la pantalla realmente pide.
     */
    accionesIrrenunciables: [
      'GET /credito/cuentas-bancarias/para-cobro',
      'GET /catalogo/almacenes/para-venta',
      'GET /catalogo/listas-precio',
      'GET /credito/productos',
      'GET /catalogo/productos/buscar',
      'GET /clientes',
    ],
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
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
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
    descripcion:
      'Requisiciones, cotizaciones, órdenes de compra y padrón de proveedores.',
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
    accionesIrrenunciables: [
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
      'GET /compras/ordenes/recepciones',
    ],
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
    descripcion:
      'Contabilidad, tesorería, facturación, activos y catálogos financieros.',
    modulos: [
      'finanzas',
      'tesoreria',
      'facturacion',
      'activos',
      'catalogos',
      'precios',
      'aprobaciones',
    ],
    modulosConsulta: [
      'ventas',
      'compras',
      'clientes',
      'proveedores',
      'credito',
      'caja',
      'gobierno-aprobaciones',
    ],
    /*
     * Alguien tiene que poder pagarle al proveedor. El pago cuelga de
     * `/compras`, que a este rol se le da solo en consulta, y al comprador se
     * le vedó por separación de funciones: sin esta línea, tras cerrar ese
     * hueco no quedaba en toda la empresa un rol capaz de pagar salvo el
     * administrador. Quien recibe la mercancía no paga, quien compra no paga:
     * paga tesorería, contra lo que el almacén dio por recibido.
     */
    accionesIrrenunciables: [
      /*
       * ────────────────────────────────────────────────────────────────────
       * El impuesto del producto lo decide Contabilidad, y hasta hoy no podía
       * --------------------------------------------------------------------
       * `impuestoId` vive en la ficha del producto, y esa ficha sólo la abre
       * el almacenista —el único rol con `inventario`—, que a propósito NO
       * tiene el catálogo de impuestos: quien acomoda mercancía no decide el
       * IVA aplicable, y así está escrito en su plantilla.
       *
       * Resultado medido el 26-sep-2026: nadie podía asignarle un impuesto a
       * un producto. Contabilidad lee los impuestos y no abre la ficha; el
       * almacén abre la ficha y no lee los impuestos. Cuatro de los siete
       * productos del catálogo llevaban meses sin impuesto, y un producto sin
       * impuesto se vende con IVA cero en silencio —ni exento, ni tasa 0: sin
       * declarar—.
       *
       * Se concede el panel fiscal: la lista mínima y la asignación. No abre
       * el maestro de productos ni toca precios ni existencias.
       * ────────────────────────────────────────────────────────────────────
       */
      'GET /catalogo/productos/fiscal',
      'PATCH /catalogo/productos/:id/impuesto',
      /*
       * Enlazar una caja o un banco con su cuenta del plan contable. La
       * pantalla cuelga de `/credito`, así que sólo ese rol podía editarla —y
       * el diagnóstico que se queja de una cuenta sin enlazar es el de
       * Finanzas: quien tiene que arreglarlo no podía—. Se concede la lectura
       * y la edición; dar de alta una cuenta nueva sigue siendo de Crédito y
       * Tesorería, que son quienes operan el dinero.
       */
      'GET /credito/cuentas-bancarias',
      'GET /credito/cuentas-bancarias/:id',
      'PATCH /credito/cuentas-bancarias/:id',
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
      /*
       * La segunda etapa del alta de estructura. Este rol ni siquiera tiene
       * RRHH en consulta —ni debe tenerlo— pero el control presupuestal de un
       * puesto nuevo es suyo, y sin estas dos lineas la etapa se queda sin
       * nadie que pueda firmarla salvo el administrador.
       */
      'GET /rrhh/estructura/solicitudes',
      'POST /rrhh/estructura/solicitudes/:id/finanzas',
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
      // La nómina: la configuración patronal, la póliza y el cierre son suyos;
      // los préstamos y la validación de cuentas, también. La plantilla y los
      // recibos siguen fuera, como se decidió al separar el alta de estructura.
      ...ACCIONES_NOMINA_CONTABILIDAD,
      ...ACCIONES_NOMINA_FINANZAS,
      // El segundo nivel de la cadena de firmas.
      ...ACCIONES_FIRMAR_NOMINA,
      ...ACCIONES_ESPEJO_CONTABLE,
    ],
  },
  {
    rol: 'contador',
    etiqueta: 'Contador',
    descripcion: 'Pólizas, cierres, CFDI, activos y catálogos SAT.',
    modulos: ['finanzas', 'facturacion', 'activos', 'catalogos'],
    modulosConsulta: [
      'ventas',
      'compras',
      'tesoreria',
      'precios',
      'caja',
      'aprobaciones',
      'gobierno-aprobaciones',
    ],
    /*
     * Decidir a qué cuenta va cada familia de productos es trabajo suyo, y la
     * pantalla donde se hace necesita listar las categorías. Las categorías
     * son del módulo de Inventario, que este rol no tiene ni en consulta: sin
     * esta línea la pantalla abre vacía y no hay nada que mapear. Es la misma
     * regla de siempre —quien ejecuta también puede ver— aplicada al revés que
     * en el almacén.
     */
    accionesIrrenunciables: [
      /*
       * ────────────────────────────────────────────────────────────────────
       * El impuesto del producto lo decide Contabilidad, y hasta hoy no podía
       * --------------------------------------------------------------------
       * `impuestoId` vive en la ficha del producto, y esa ficha sólo la abre
       * el almacenista —el único rol con `inventario`—, que a propósito NO
       * tiene el catálogo de impuestos: quien acomoda mercancía no decide el
       * IVA aplicable, y así está escrito en su plantilla.
       *
       * Resultado medido el 26-sep-2026: nadie podía asignarle un impuesto a
       * un producto. Contabilidad lee los impuestos y no abre la ficha; el
       * almacén abre la ficha y no lee los impuestos. Cuatro de los siete
       * productos del catálogo llevaban meses sin impuesto, y un producto sin
       * impuesto se vende con IVA cero en silencio —ni exento, ni tasa 0: sin
       * declarar—.
       *
       * Se concede el panel fiscal: la lista mínima y la asignación. No abre
       * el maestro de productos ni toca precios ni existencias.
       * ────────────────────────────────────────────────────────────────────
       */
      'GET /catalogo/productos/fiscal',
      'PATCH /catalogo/productos/:id/impuesto',
      /*
       * Enlazar una caja o un banco con su cuenta del plan contable. La
       * pantalla cuelga de `/credito`, así que sólo ese rol podía editarla —y
       * el diagnóstico que se queja de una cuenta sin enlazar es el de
       * Finanzas: quien tiene que arreglarlo no podía—. Se concede la lectura
       * y la edición; dar de alta una cuenta nueva sigue siendo de Crédito y
       * Tesorería, que son quienes operan el dinero.
       */
      'GET /credito/cuentas-bancarias',
      'GET /credito/cuentas-bancarias/:id',
      'PATCH /credito/cuentas-bancarias/:id',
      /*
       * La conciliación de cartera: verla, ejecutarla y cerrar una
       * discrepancia. Los tres endpoints nombran a este rol en su `@Roles` y
       * la tabla de permisos no se los daba, así que `credito` podía ver las
       * diferencias y no resolverlas, y contabilidad podía resolverlas y no
       * verlas. Comprobado en vivo: 403 en los tres.
       */
      'GET /integracion/conciliacion',
      'POST /integracion/conciliacion/ejecutar',
      'PATCH /integracion/conciliacion/:id/resolver',
      /*
       * ── Lo que el decorador ya prometía ──────────────────────────────────
       * `GET /integracion/avisos` y su resolución nombran a este rol en su
       * `@Roles`, y `@Roles` sólo puede DENEGAR: sin la concesión, la otra
       * capa contestaba 403. La bandeja de avisos del espejo contable —donde
       * aparece cada póliza que no llegó al mayor externo— no la miraba nadie.
       * Igual con el estado contable de los productos de crédito.
       */
      'GET /integracion/avisos',
      'PATCH /integracion/avisos/:id/resolver',
      'GET /credito/productos/estado',
      'POST /credito/productos/:id/verificar',
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
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
      // La nómina por el lado contable: identidad patronal, póliza y cierre.
      ...ACCIONES_NOMINA_CONTABILIDAD,
      // Y puede firmar el nivel de Finanzas cuando le toque sustituirla.
      ...ACCIONES_FIRMAR_NOMINA,
      ...ACCIONES_ESPEJO_CONTABLE,
    ],
  },
  {
    rol: 'tesoreria',
    etiqueta: 'Tesorería',
    descripcion:
      'Saldos, movimientos, traspasos, conciliación bancaria y caja.',
    modulos: ['tesoreria', 'caja', 'aprobaciones'],
    // Quien paga tiene que poder ver qué paga y a quién: la orden de compra y
    // el padrón de proveedores, en consulta.
    modulosConsulta: [
      'finanzas',
      'credito',
      'catalogos',
      'compras',
      'proveedores',
      'gobierno-aprobaciones',
    ],
    /*
     * Alguien tiene que poder pagarle al proveedor. El pago cuelga de
     * `/compras`, que a este rol se le da solo en consulta, y al comprador se
     * le vedó por separación de funciones: sin esta línea, tras cerrar ese
     * hueco no quedaba en toda la empresa un rol capaz de pagar salvo el
     * administrador. Quien recibe la mercancía no paga, quien compra no paga:
     * paga tesorería, contra lo que el almacén dio por recibido.
     */
    accionesIrrenunciables: [
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
      'PATCH /compras/ordenes/:id/pagar',
      // La acción sin la consulta no sirve: la pantalla de pago abre vacía si
      // no puede listar ni abrir la orden. Pasó con el almacenista —podía ver
      // el manifiesto y no firmarlo— y aquí al revés: podía firmar el pago y
      // no ver qué pagar.
      'GET /compras/ordenes',
      'GET /compras/ordenes/:id',
      // Y la nómina: dispersarla y pagarla es suyo. Sin esto el sistema le
      // encargaba el pago y no la dejaba abrir la pantalla.
      ...ACCIONES_NOMINA_TESORERIA,
      // El tercer nivel de la cadena de firmas es suyo.
      ...ACCIONES_FIRMAR_NOMINA,
    ],
  },
  {
    rol: 'credito',
    etiqueta: 'Crédito',
    descripcion: 'Línea de crédito, verificación del cliente y originación.',
    modulos: ['credito', 'clientes', 'aprobaciones'],
    modulosConsulta: [
      'ventas',
      'facturacion',
      'integracion',
      'gobierno-aprobaciones',
    ],
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
    /*
     * Correr la verificación sobre un cliente real.
     *
     * La descripción de este rol dice «verificación del cliente» desde el
     * primer día, pero del módulo `integracion` sólo tenía consulta, así que
     * podía leer expedientes y no producirlos. Y la puerta que autoriza la
     * línea exige un expediente que cubra el importe. El resultado era un
     * callejón: la única persona a la que la matriz manda la solicitud era la
     * única que no podía cumplir el requisito para resolverla.
     *
     * Va como acción irrenunciable y no como módulo completo: lo que necesita
     * es ejecutar el flujo, no diseñarlo. Crear, activar o simular flujos
     * siguen siendo de administración, y `simular` además marca el expediente
     * como simulación, que la puerta no acepta.
     */
    accionesIrrenunciables: [
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
      'POST /integracion/validacion/ejecutar',
    ],
  },
  {
    rol: 'cobranza',
    etiqueta: 'Cobranza',
    descripcion: 'Cartera, cobros, estados de cuenta y city ledger.',
    /*
     * El city ledger es suyo —convenios, cartera del hotel y sus cobros—, pero
     * el resto de hoteleria no. Mientras el credito hotelero vivio dentro del
     * modulo «hoteleria», darselo significaba darle tambien la configuracion
     * de las propiedades y la auditoria nocturna: se comprobo el 25-sep-2026
     * entrando con este rol a las diez pantallas de recepcion. Ahora el city
     * ledger es un modulo aparte y hoteleria queda vedada explicitamente, para
     * que las filas que el reparto viejo dejo encendidas se apaguen al
     * arrancar.
     */
    modulos: ['credito', 'clientes', 'city-ledger'],
    modulosConsulta: ['ventas', 'facturacion', 'caja'],
    modulosVedados: ['hoteleria'],
    accionesIrrenunciables: [
      /*
       * El tablero de validación de expedientes nombra a `cobranza` en su
       * `@Roles`; sin la concesión, el decorador prometía un acceso que la
       * tabla de permisos negaba.
       */
      'GET /integracion/validacion/tablero',
      'GET /integracion/validacion/expedientes',
      'GET /integracion/validacion/expedientes/:id',
      'POST /integracion/validacion/ejecutar',
    ],
  },
  {
    rol: 'hoteleria',
    etiqueta: 'Hotelería',
    descripcion:
      'Operación del hotel: disponibilidad, ama de llaves, city ledger, recetas y auditoría nocturna.',
    modulos: [
      'hoteleria',
      /* Recepcion abre el folio contra convenio y consulta el credito. */
      'city-ledger',
      'recetas',
      'clientes',
      'aprobaciones',
    ],
    modulosConsulta: ['inventario', 'ventas', 'gobierno-aprobaciones'],
    /*
     * El almacen de insumos, sin el almacen entero.
     *
     * La configuracion del hotel pide un «Almacen de insumos»: de ahi se
     * descuentan los consumos que se cargan al folio. Ese desplegable se
     * llenaba con `GET /catalogo/almacenes`, que pertenece al modulo
     * `almacenes` —direccion, responsable y configuracion de cada bodega— y
     * que hoteleria no tiene. El 403 se volvia lista vacia: un control
     * obligatorio que nadie podia contestar, y detras, un consumo que nunca
     * se podia postear («El hotel no tiene almacen para descontar el
     * consumo»). Se vio recorriendo la pantalla el 25-sep-2026.
     *
     * Se declara la lista corta —id y nombre— que ya existia para el
     * mostrador. No abre el modulo de almacenes: solo permite elegir uno.
     */
    accionesIrrenunciables: [
      'GET /catalogo/almacenes/para-venta',
      /*
       * Y la lista corta de cajas. Recepcion cobra el folio al hacer
       * check-out: sin poder nombrar una caja no hay cobro. `GET
       * /credito/cuentas-bancarias` trae CLABE y numero de cuenta y no le
       * corresponde; `para-cobro` da nombre y tipo, que es lo que el
       * desplegable necesita.
       */
      'GET /credito/cuentas-bancarias/para-cobro',
    ],
    accionesVedadas: ['GET /credito/cuentas-bancarias'],
  },
  {
    rol: 'rrhh',
    etiqueta: 'Recursos Humanos',
    descripcion:
      'Empleados, puestos, asistencia, incidencias, vacaciones, nómina y departamentos.',
    modulos: ['rrhh', 'aprobaciones'],
    modulosConsulta: ['tablero', 'gobierno-aprobaciones'],
    /*
     * Quien pide el puesto no lo firma.
     *
     * El modulo `rrhh` cubre todo `/rrhh/*`, asi que al entrar la estructura
     * organizacional en la tabla de permisos —antes se la saltaba entera— este
     * rol quedo con permiso para resolver LAS DOS etapas de su propia
     * solicitud. El servicio ya lo negaba —«Esta etapa requiere el rol
     * Gerencia», comprobado en vivo— pero `mis-permisos` decia que si, y de
     * ahi saca el frontend que botones pintar: un boton que siempre contesta
     * 403, que es justo el patron que se cerro en credito.
     *
     * RRHH levanta la solicitud y la sigue. Gerencia firma la primera etapa
     * por control de mando y Finanzas la segunda por control presupuestal.
     */
    accionesVedadas: [
      'POST /rrhh/estructura/solicitudes/:id/gerencia',
      'POST /rrhh/estructura/solicitudes/:id/finanzas',
    ],
    accionesIrrenunciables: [
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
    ],
  },
  {
    rol: 'gerencia',
    etiqueta: 'Gerencia',
    descripcion:
      'Aprueba y mira todo lo operativo, sin tocar la configuración del sistema.',
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
      'city-ledger',
      'facturacion',
      'activos',
      'gobierno-aprobaciones',
    ],
    /*
     * ────────────────────────────────────────────────────────────────────────
     * La nómina individual no es «mirar lo operativo»
     * ------------------------------------------------------------------------
     * Con `rrhh` en consulta este rol recibía TREINTA lecturas de Recursos
     * Humanos, y entre ellas los recibos de nómina de cada persona, las
     * cuentas bancarias de los empleados, sus préstamos, los cálculos de
     * finiquito —o sea quién está por salir— y el archivo de dispersión.
     * Verificado en vivo el 22-sep con la sesión de Gerencia: 200 en todas.
     *
     * Plantilla, asistencia, incidencias, vacaciones y el coste agregado sí
     * son suyos: aprueba altas de puesto y de área y necesita ver a su gente.
     * Lo que se retira es la compensación persona por persona y los datos de
     * pago, que en los ERP grandes viven en RRHH y en Finanzas, no en la
     * dirección operativa. Aquí además son datos personales en el sentido de
     * la LFPDPPP: filtrarlos por omisión es el modo de fallo, no por decisión.
     *
     * Si SUMA decide que su gerencia debe ver sueldos, se quita este bloque o
     * se concede desde Administración → Roles y permisos. Que cueste una línea
     * visible es el punto; que viniera de regalo, no.
     * ────────────────────────────────────────────────────────────────────────
     */
    /*
     * Su etapa del alta de estructura. Va por ACCION porque este rol tiene
     * RRHH solo en consulta —y debe seguir asi: firmar la creacion de un
     * puesto no es leer la nomina—. Sin estas dos lineas la pantalla de
     * aprobaciones no le aparece en el menu, que es como estaba: invisible
     * para los tres roles que la usan.
     */
    accionesIrrenunciables: [
      /*
       * Anular una venta. `ROLES_AUTORIZADORES_ANULACION` designa a GERENCIA y
       * DIRECCION —y el umbral es cero a propósito: anular elimina la venta
       * entera y no debe estar al alcance de un cajero por ningún importe—,
       * pero el módulo `ventas` es del mostrador, así que la otra capa les
       * contestaba 403. Medido el 25-sep-2026: el cajero recibía «requiere
       * autorización de gerencia» y gerencia no podía. NINGUNA venta del
       * sistema se podía anular.
       */
      'GET /ventas',
      'PATCH /ventas/:id/anular',
      /*
       * Deshacer una cobranza. `@Roles` nombra a este rol —es de las
       * decisiones que se reservan al mando— y el permiso no estaba: el
       * endpoint contestaba 403 a quien el propio controlador designa.
       */
      'POST /credito/cobranza/pago/:id/cancelar',
      /*
       * ── Lo que el decorador ya prometía ──────────────────────────────────
       * Los endpoints de validación de expedientes nombran a este rol en su
       * `@Roles`. Como `@Roles` sólo deniega, el tablero y los flujos le
       * contestaban 403: figuraba como responsable de un gobierno que no podía
       * ni mirar.
       */
      'GET /integracion/validacion/flujos',
      'GET /integracion/validacion/flujos/:id',
      'GET /integracion/validacion/flujos/plantilla',
      'GET /integracion/validacion/capacidades',
      'GET /integracion/validacion/tablero',
      'GET /integracion/validacion/expedientes',
      'GET /integracion/validacion/expedientes/:id',
      'POST /integracion/validacion/ejecutar',
      'POST /integracion/validacion/simular',
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
      'GET /rrhh/estructura/solicitudes',
      'POST /rrhh/estructura/solicitudes/:id/gerencia',
      /*
       * La primera firma de la nómina. Autoriza por los TOTALES del periodo,
       * que es la decisión que le toca; la prenómina trabajador por trabajador
       * y los recibos siguen vedados más abajo, y eso no cambia: el sueldo de
       * cada quien no es asunto de esta firma.
       *
       * Antes esa primera firma era de RRHH, el mismo rol que prepara la
       * nómina, y como quien prepara no puede firmar, la cadena se trababa
       * siempre en una empresa con una sola persona de Recursos humanos.
       */
      ...ACCIONES_FIRMAR_NOMINA,
      /*
       * Cerrar un conteo físico y autorizar una transferencia entre almacenes.
       * Sin esto, en una empresa con un solo almacenista no se puede hacer ni
       * lo uno ni lo otro: ver `ACCIONES_AUTORIZAR_ALMACEN`.
       */
      ...ACCIONES_AUTORIZAR_ALMACEN,
      ...ACCIONES_AUTORIZAR_OPERACION,
    ],
    accionesVedadas: [
      'GET /rrhh/nomina/recibos',
      'GET /rrhh/nomina/recibos/:id',
      'GET /rrhh/empleados/:id/finiquito',
      'GET /rrhh/nomina-avanzada/conceptos-empleado',
      'GET /rrhh/nomina-avanzada/prestamos',
      'GET /rrhh/nomina-avanzada/cuentas-bancarias',
      'GET /rrhh/nomina-avanzada/periodos/:id/prenomina',
      'GET /rrhh/nomina-avanzada/periodos/:id/cfdi',
      'GET /rrhh/nomina-avanzada/periodos/:id/dispersion',
      'GET /rrhh/nomina-avanzada/periodos/:id/pago',
      'GET /rrhh/nomina-avanzada/periodos/:id/poliza-detallada',
    ],
  },
  {
    rol: 'direccion',
    etiqueta: 'Dirección',
    descripcion:
      'Lo mismo que gerencia, más la lectura de la integración con el core.',
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
      'city-ledger',
      'facturacion',
      'integracion',
      'gobierno-aprobaciones',
    ],
    // El mismo recorte que gerencia, y por el mismo motivo. Si en SUMA la
    // direccion es la propiedad y debe ver la nomina, se concede a mano: es
    // una decision que merece quedar escrita, no heredarse de un modulo.
    /*
     * ────────────────────────────────────────────────────────────────────────
     * La nómina individual no es «mirar lo operativo»
     * ------------------------------------------------------------------------
     * Con `rrhh` en consulta este rol recibía TREINTA lecturas de Recursos
     * Humanos, y entre ellas los recibos de nómina de cada persona, las
     * cuentas bancarias de los empleados, sus préstamos, los cálculos de
     * finiquito —o sea quién está por salir— y el archivo de dispersión.
     * Verificado en vivo el 22-sep con la sesión de Gerencia: 200 en todas.
     *
     * Plantilla, asistencia, incidencias, vacaciones y el coste agregado sí
     * son suyos: aprueba altas de puesto y de área y necesita ver a su gente.
     * Lo que se retira es la compensación persona por persona y los datos de
     * pago, que en los ERP grandes viven en RRHH y en Finanzas, no en la
     * dirección operativa. Aquí además son datos personales en el sentido de
     * la LFPDPPP: filtrarlos por omisión es el modo de fallo, no por decisión.
     *
     * Si SUMA decide que su gerencia debe ver sueldos, se quita este bloque o
     * se concede desde Administración → Roles y permisos. Que cueste una línea
     * visible es el punto; que viniera de regalo, no.
     * ────────────────────────────────────────────────────────────────────────
     */
    /*
     * La etapa de GERENCIA, a proposito y no por descuido: direccion esta por
     * encima y la cubre cuando el gerente falta. Sin esa holgura el alta de
     * puestos se para en cuanto una persona se va de vacaciones, que es el
     * problema que la cadena de firmantes viene a resolver en todas partes.
     *
     * No rompe la segregacion: la SEGUNDA etapa no la tiene, asi que direccion
     * no puede cubrir las dos. Va por ACCION porque este rol tiene RRHH solo en
     * consulta —y debe seguir asi: firmar la creacion de un puesto no es leer
     * la nomina—.
     */
    accionesIrrenunciables: [
      /*
       * Anular una venta. `ROLES_AUTORIZADORES_ANULACION` designa a GERENCIA y
       * DIRECCION —y el umbral es cero a propósito: anular elimina la venta
       * entera y no debe estar al alcance de un cajero por ningún importe—,
       * pero el módulo `ventas` es del mostrador, así que la otra capa les
       * contestaba 403. Medido el 25-sep-2026: el cajero recibía «requiere
       * autorización de gerencia» y gerencia no podía. NINGUNA venta del
       * sistema se podía anular.
       */
      'GET /ventas',
      'PATCH /ventas/:id/anular',
      /*
       * La conciliación de cartera: verla, ejecutarla y cerrar una
       * discrepancia. Los tres endpoints nombran a este rol en su `@Roles` y
       * la tabla de permisos no se los daba, así que `credito` podía ver las
       * diferencias y no resolverlas, y contabilidad podía resolverlas y no
       * verlas. Comprobado en vivo: 403 en los tres.
       */
      'GET /integracion/conciliacion',
      'POST /integracion/conciliacion/ejecutar',
      'PATCH /integracion/conciliacion/:id/resolver',
      /*
       * Deshacer una cobranza. `@Roles` nombra a este rol —es de las
       * decisiones que se reservan al mando— y el permiso no estaba: el
       * endpoint contestaba 403 a quien el propio controlador designa.
       */
      'POST /credito/cobranza/pago/:id/cancelar',
      /*
       * ── Lo que el decorador ya prometía ──────────────────────────────────
       * `GET /integracion/avisos` y su resolución nombran a este rol en su
       * `@Roles`, y `@Roles` sólo puede DENEGAR: sin la concesión, la otra
       * capa contestaba 403. La bandeja de avisos del espejo contable —donde
       * aparece cada póliza que no llegó al mayor externo— no la miraba nadie.
       * Igual con el estado contable de los productos de crédito.
       */
      'GET /integracion/avisos',
      'PATCH /integracion/avisos/:id/resolver',
      'GET /credito/productos/estado',
      'POST /credito/productos/:id/verificar',
      /*
       * ── Lo que el decorador ya prometía ──────────────────────────────────
       * Los endpoints de validación de expedientes nombran a este rol en su
       * `@Roles`. Como `@Roles` sólo deniega, el tablero y los flujos le
       * contestaban 403: figuraba como responsable de un gobierno que no podía
       * ni mirar.
       */
      'GET /integracion/validacion/flujos',
      'GET /integracion/validacion/flujos/:id',
      'GET /integracion/validacion/flujos/plantilla',
      'GET /integracion/validacion/capacidades',
      'GET /integracion/validacion/tablero',
      'GET /integracion/validacion/expedientes',
      'GET /integracion/validacion/expedientes/:id',
      'POST /integracion/validacion/ejecutar',
      'POST /integracion/validacion/simular',
      // El tablero de pendientes: cuentas, no documentos.
      ACCION_TABLERO_PENDIENTES,
      'GET /rrhh/estructura/solicitudes',
      'POST /rrhh/estructura/solicitudes/:id/gerencia',
      /*
       * La primera firma de la nómina. Autoriza por los TOTALES del periodo,
       * que es la decisión que le toca; la prenómina trabajador por trabajador
       * y los recibos siguen vedados más abajo, y eso no cambia: el sueldo de
       * cada quien no es asunto de esta firma.
       *
       * Antes esa primera firma era de RRHH, el mismo rol que prepara la
       * nómina, y como quien prepara no puede firmar, la cadena se trababa
       * siempre en una empresa con una sola persona de Recursos humanos.
       */
      ...ACCIONES_FIRMAR_NOMINA,
      // Lo mismo que gerencia.
      ...ACCIONES_AUTORIZAR_ALMACEN,
      ...ACCIONES_AUTORIZAR_OPERACION,
    ],
    accionesVedadas: [
      'GET /rrhh/nomina/recibos',
      'GET /rrhh/nomina/recibos/:id',
      'GET /rrhh/empleados/:id/finiquito',
      'GET /rrhh/nomina-avanzada/conceptos-empleado',
      'GET /rrhh/nomina-avanzada/prestamos',
      'GET /rrhh/nomina-avanzada/cuentas-bancarias',
      'GET /rrhh/nomina-avanzada/periodos/:id/prenomina',
      'GET /rrhh/nomina-avanzada/periodos/:id/cfdi',
      'GET /rrhh/nomina-avanzada/periodos/:id/dispersion',
      'GET /rrhh/nomina-avanzada/periodos/:id/pago',
      'GET /rrhh/nomina-avanzada/periodos/:id/poliza-detallada',
    ],
  },

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Gobierno de aprobaciones
   * --------------------------------------------------------------------------
   * El rol que escribe la regla y no la firma.
   *
   * Hasta hoy la matriz de aprobación —quién aprueba qué, desde qué monto, en
   * qué orden— la podían reescribir siete de los doce roles, que son
   * exactamente los siete que aprueban algo. Cualquiera de ellos podía borrar
   * el renglón que exige su propia firma, y el sistema lo habría aceptado sin
   * dejar rastro en ninguna pantalla.
   *
   * Es el «approval administrator» de Business Central y el superusuario que
   * define los procedimientos de aprobación en SAP B1, con una diferencia
   * deliberada: aquí no aprueba nada. `PATCH /aprobaciones/:id/resolver` le
   * está vedado explícitamente, no sólo ausente, para que siga vedado aunque
   * un día alguien le conceda el módulo entero desde la pantalla de permisos.
   *
   * Por qué SÍ ve la bandeja y el historial completo: no se puede gobernar lo
   * que no se ve. Quien diseña la matriz tiene que poder comprobar que los
   * documentos llegan a quien deben y que no se quedan parados —el expediente
   * de María Fernanda estuvo tres días atascado y nadie lo miraba—. Y es el
   * rol seguro para dárselo precisamente porque no puede actuar sobre nada de
   * lo que ve: ésa es la posición del auditor.
   *
   * Los dos GET sueltos van por acción y no por módulo a propósito.
   * `/departamentos` vive en RRHH junto a la nómina, y `/usuarios` en
   * Administración junto a los permisos; necesita leer los dos para clavar
   * aprobadores, y ninguno de los dos módulos entero.
   * ──────────────────────────────────────────────────────────────────────────
   */
  {
    rol: 'gobierno',
    etiqueta: 'Gobierno de aprobaciones',
    descripcion:
      'Define quién aprueba qué, desde qué monto y en qué orden. Vigila que los documentos lleguen y avancen. No firma ninguno.',
    modulos: ['gobierno-aprobaciones'],
    modulosConsulta: ['aprobaciones', 'tablero'],
    accionesIrrenunciables: [
      'GET /departamentos',
      'GET /usuarios',
      'GET /usuarios/:id',
    ],
    /*
     * Lo que lo define. Si algún día este renglón desaparece, el rol deja de
     * ser un control y pasa a ser un aprobador más con poder para reescribir
     * las reglas: el peor de los dos mundos.
     */
    accionesVedadas: ['PATCH /aprobaciones/:id/resolver'],
  },
];
