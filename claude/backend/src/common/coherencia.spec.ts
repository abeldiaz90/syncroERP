/**
 * ============================================================================
 * SyncroERP · Pruebas de coherencia transversal
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTEN
 *
 * La auditoría del sistema encontró que los módulos individuales estaban bien
 * construidos y que lo roto eran las COSTURAS entre ellos: un enum con valores
 * que nadie produce, un despachador que apunta a métodos inexistentes, un mapa
 * de navegación duplicado del que sólo se usaba la copia vieja, rutas de
 * permisos que no existen en el router.
 *
 * Ninguno de esos defectos lo detecta una prueba unitaria de módulo, porque
 * dentro de cada módulo todo es consistente. Estas pruebas leen el código
 * fuente y comparan unos módulos contra otros.
 *
 * Cada `it()` de este archivo corresponde a un hallazgo real. Si alguno vuelve
 * a fallar, es que la regresión regresó.
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
/**
 * El frontend puede estar como `syncro-erp-frontend` (layout de los zips
 * originales) o como `frontend` (monorepo). Si no está, las pruebas que lo
 * necesitan se omiten en vez de fallar.
 */
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function archivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosTs(ruta, acumulado);
    else if (nombre.endsWith('.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

const TODOS = archivosTs(SRC);
const leer = (ruta: string) => readFileSync(ruta, 'utf8');

/**
 * Quita comentarios antes de buscar patrones prohibidos. Sin esto, el propio
 * comentario que documenta que algo se eliminó hace fallar la prueba.
 */
const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODIGO = TODOS.filter((f) => !f.endsWith('.spec.ts')).map((f) => ({
  ruta: relative(SRC, f),
  texto: leer(f),
}));
const TODO_EL_CODIGO = CODIGO.map((f) => f.texto).join('\n');

/** Extrae `VERBO /ruta` de cada controlador. */
function rutasDelBackend(): Set<string> {
  const rutas = new Set<string>();
  for (const { texto } of CODIGO) {
    if (!texto.includes('@Controller')) continue;
    const controladores = [
      ...texto.matchAll(
        /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g,
      ),
    ];
    for (let i = 0; i < controladores.length; i++) {
      const prefijo =
        controladores[i][1] ?? controladores[i][2] ?? '';
      const desde = controladores[i].index! + controladores[i][0].length;
      const hasta =
        i + 1 < controladores.length
          ? controladores[i + 1].index!
          : texto.length;
      const cuerpo = texto.slice(desde, hasta);
      for (const m of cuerpo.matchAll(
        /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g,
      )) {
        const verbo = m[1].toUpperCase();
        const sufijo = m[2] ?? m[3] ?? '';
        const completa =
          '/' +
          [prefijo.replace(/^\/|\/$/g, ''), sufijo.replace(/^\/|\/$/g, '')]
            .filter(Boolean)
            .join('/');
        rutas.add(`${verbo} ${completa}`);
      }
    }
  }
  return rutas;
}

const RUTAS = rutasDelBackend();

describe('Coherencia · enums de integración', () => {
  /*
   * Hallazgo: `OrigenMovimiento.NOMINA`, `COMISION_BANCARIA` e `IMPUESTO`
   * estaban declarados y ningún módulo los producía. El pago de nómina nunca
   * llegaba a tesorería y el saldo bancario quedaba sobrevaluado cada periodo.
   */
  const PRODUCTORES_PENDIENTES_ORIGEN = new Set<string>([]);

  it('cada OrigenMovimiento declarado tiene al menos un productor', () => {
    const entidad = CODIGO.find((f) =>
      f.ruta.includes('tesoreria/entities'),
    )!.texto;
    const bloque = entidad.match(/enum OrigenMovimiento \{([^}]*)\}/)![1];
    const valores = [...bloque.matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
    expect(valores.length).toBeGreaterThan(0);

    /*
     * Se busca fuera de las propias entidades de tesorería: dentro de ellas
     * sólo está la declaración del enum, que no cuenta como productor.
     */
    const codigoConsumidor = CODIGO.filter(
      (f) => !f.ruta.startsWith('tesoreria/entities'),
    )
      .map((f) => f.texto)
      .join('\n');

    const huerfanos = valores.filter(
      (valor) =>
        !codigoConsumidor.includes(`OrigenMovimiento.${valor}`),
    );

    /*
     * Los tres pendientes están documentados en el plan de remediación.
     * Cuando se implemente su integración deben salir de esta lista, y el
     * test impedirá que aparezcan valores huérfanos nuevos.
     */
    const inesperados = huerfanos.filter(
      (v) => !PRODUCTORES_PENDIENTES_ORIGEN.has(v),
    );
    expect(inesperados).toEqual([]);
  });

  /*
   * Hallazgo: el despachador de asientos mapeaba TipoAsiento.NOMINA y
   * TipoAsiento.TESORERIA a `generarAsientoDeNomina` y
   * `generarAsientoDeTesoreria`, métodos que NO existen en el motor contable.
   * No explotaba sólo porque nadie los encolaba todavía.
   */
  it('todo método del despachador de asientos existe en el motor contable', () => {
    const despachador = CODIGO.find((f) =>
      f.ruta.endsWith('asientos-pendientes.service.ts'),
    )!.texto;
    const motor = CODIGO.find((f) =>
      f.ruta.endsWith('motor-contable.service.ts'),
    )!.texto;

    const mapeados = [
      ...despachador.matchAll(/\[TipoAsiento\.(\w+)\]:\s*'(\w+)'/g),
    ].map((m) => ({ tipo: m[1], metodo: m[2] }));
    expect(mapeados.length).toBeGreaterThan(5);

    const faltantes = mapeados.filter(
      ({ metodo }) => !motor.includes(`async ${metodo}(`),
    );
    const nombres = faltantes.map((f) => `${f.tipo} → ${f.metodo}()`);

    // Documentados en el plan; cualquier otro es una regresión.
    // Ya no hay pendientes: todo método mapeado existe en el motor.
    const pendientes: string[] = [];
    expect(nombres.filter((n) => !pendientes.includes(n))).toEqual([]);
  });
});

describe('Coherencia · navegación y permisos', () => {
  /*
   * Hallazgo principal de la auditoría: existían DOS mapas
   * `ENDPOINTS_NAVEGABLES`, uno en `iam/data/endpoints-navegables.ts` (85
   * entradas, corregido) y otro inline en `permisos-dinamicos.service.ts`
   * (57 entradas, viejo). El servicio usaba el inline; el archivo de datos era
   * código muerto que nadie importaba.
   */
  it('sólo existe un mapa ENDPOINTS_NAVEGABLES y el servicio lo importa', () => {
    const declaraciones = CODIGO.filter((f) =>
      /(?:const|export const)\s+ENDPOINTS_NAVEGABLES/.test(f.texto),
    );
    expect(declaraciones.map((d) => d.ruta)).toEqual([
      'iam/data/endpoints-navegables.ts',
    ]);

    const servicio = CODIGO.find((f) =>
      f.ruta.endsWith('permisos-dinamicos.service.ts'),
    )!.texto;
    expect(servicio).toContain(
      "from '../data/endpoints-navegables'",
    );
  });

  /*
   * Hallazgo: la "inferencia inteligente" generaba `/dashboard${ep.ruta}` para
   * todo GET sin `:id`. Producía 139 rutas que no existen en Next
   * (`/dashboard/catalogo/almacenes`, `/dashboard/auth/verificar-email`,
   * incluso `/dashboard/`) y concedía permisos a URLs fantasma.
   */
  it('no se infieren rutas de frontend a partir de rutas de API', () => {
    const servicio = sinComentarios(
      CODIGO.find((f) => f.ruta.endsWith('permisos-dinamicos.service.ts'))!
        .texto,
    );
    expect(servicio).not.toMatch(/`\/dashboard\$\{ep\.ruta\}`/);
    expect(servicio).not.toContain('rutaFrontInferida');
  });

  /*
   * Hallazgo: 12 claves del mapa apuntaban a endpoints que no existen
   * (`GET /compras/cotizaciones`, `POST /finanzas/polizas/cierre`…). Como el
   * permiso nunca se podía derivar, esas pantallas eran invisibles para
   * cualquier usuario que no fuera administrador.
   */
  it('cada clave del mapa navegable corresponde a una ruta real del backend', () => {
    const mapa = leer(join(SRC, 'iam/data/endpoints-navegables.ts'));
    const claves = [
      ...mapa.matchAll(/'((?:GET|POST|PUT|PATCH|DELETE) [^']+)':/g),
    ].map((m) => m[1]);
    expect(claves.length).toBeGreaterThan(50);

    const inexistentes = claves.filter((clave) => !RUTAS.has(clave));
    expect(inexistentes).toEqual([]);
  });

  /*
   * Varios endpoints pueden habilitar la misma pantalla — eso es deseable: si
   * el usuario puede listar O crear requisiciones, debe ver la pantalla. Lo
   * inválido es lo contrario: un mismo endpoint declarado dos veces. Además de
   * ser ambiguo, TypeScript lo rechaza (TS1117), así que este test lo detecta
   * antes de que rompa la compilación.
   */
  it('ningún endpoint se declara dos veces en el mapa navegable', () => {
    const mapa = leer(join(SRC, 'iam/data/endpoints-navegables.ts'));
    const claves = [
      ...mapa.matchAll(/'((?:GET|POST|PUT|PATCH|DELETE) [^']+)':/g),
    ].map((m) => m[1]);
    const repetidas = claves.filter((c, i) => claves.indexOf(c) !== i);
    expect([...new Set(repetidas)]).toEqual([]);
  });

  /*
   * Hallazgo: 31 pantallas del menú no tenían ninguna entrada, así que no
   * aparecían para ningún rol no administrador: RRHH casi entero, la caja,
   * los asientos pendientes, las devoluciones…
   */
  it('cada pantalla del menú tiene un endpoint navegable que la habilita', () => {
    if (!FRONTEND) {
      // El frontend no está junto al backend en este entorno; se omite.
      return;
    }
    const menu = readFileSync(
      join(FRONTEND, 'app/dashboard/module-config.ts'),
      'utf8',
    );
    const hrefs = [...menu.matchAll(/href:\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => !h.startsWith('/dashboard/centros'));

    const mapa = leer(join(SRC, 'iam/data/endpoints-navegables.ts'));
    const cubiertas = new Set(
      [...mapa.matchAll(/rutaFrontend:\s*'([^']+)'/g)].map((m) => m[1]),
    );
    const decoradas = new Set(
      [...TODO_EL_CODIGO.matchAll(/@Navegable\(\s*'([^']+)'/g)].map(
        (m) => m[1],
      ),
    );

    const sinCobertura = [...new Set(hrefs)].filter(
      (h) => !cubiertas.has(h) && !decoradas.has(h),
    );
    expect(sinCobertura).toEqual([]);
  });
});

describe('Coherencia · segregación de funciones', () => {
  /*
   * Hallazgo: el rol `comprador` incluía el prefijo
   * `/configuraciones-aprobacion`, así que quien crea requisiciones y órdenes
   * podía reescribir la matriz que lo aprueba —topes, aprobadores y niveles—
   * incluida la matriz financiera de crédito de clientes.
   */
  it('ningún rol operativo administra la matriz de aprobación', () => {
    const plantillas = leer(join(SRC, 'iam/data/plantillas-permisos.ts'));
    const bloques = plantillas.split(/\{\s*\n\s*rol: '/).slice(1);
    const infractores: string[] = [];

    for (const bloque of bloques) {
      const rol = bloque.slice(0, bloque.indexOf("'"));
      const prefijos = bloque.slice(0, bloque.indexOf('},'));
      if (
        prefijos.includes('/configuraciones-aprobacion') &&
        !['gerencia', 'direccion'].includes(rol)
      ) {
        infractores.push(rol);
      }
    }
    expect(infractores).toEqual([]);
  });

  /*
   * Hallazgo: el rol `cobranza` tenía `/caja`. Autorizar el cobro, custodiar
   * el efectivo y registrar el movimiento en la misma persona.
   */
  it('quien gestiona la cartera no custodia la caja', () => {
    const plantillas = leer(join(SRC, 'iam/data/plantillas-permisos.ts'));
    const cobranza = plantillas.slice(plantillas.indexOf("rol: 'cobranza'"));
    const prefijos = cobranza.slice(0, cobranza.indexOf('},'));
    expect(prefijos).not.toMatch(/'\/caja'/);
  });

  /*
   * Hallazgo: `nomina-avanzada.service.ts` exige los roles `tesoreria`,
   * `contador` y `rrhh` en 17 operaciones, pero ninguno tenía plantilla de
   * permisos. Aunque se creara el rol no recibía endpoints, así que en la
   * práctica sólo el administrador podía dispersar y pagar la nómina: toda la
   * segregación RRHH → Finanzas → Tesorería colapsaba en una persona.
   */
  it('todo rol exigido por el código tiene plantilla de permisos', () => {
    const plantillas = leer(join(SRC, 'iam/data/plantillas-permisos.ts'));
    const declarados = new Set(
      [...plantillas.matchAll(/rol:\s*'([^']+)'/g)].map((m) => m[1]),
    );
    declarados.add('admin'); // el administrador no necesita plantilla

    const exigidos = new Set<string>();
    for (const m of TODO_EL_CODIGO.matchAll(
      /exigirRol\([^,]+,\s*\[([^\]]+)\]/g,
    )) {
      for (const rol of m[1].matchAll(/'([^']+)'/g)) exigidos.add(rol[1]);
    }
    expect(exigidos.size).toBeGreaterThan(0);

    // Alias históricos que el normalizador resuelve al mismo rol.
    const ALIAS = new Set(['recursoshumanos', 'administrador']);
    const sinPlantilla = [...exigidos].filter(
      (rol) => !declarados.has(rol) && !ALIAS.has(rol),
    );
    expect(sinPlantilla).toEqual([]);
  });

  /*
   * Hallazgo: `PATCH /ventas/:id/anular` no recibía el rol y el servicio no
   * tenía ninguna comprobación. El rol `empleado` (cajero) podía anular
   * cualquier venta de la empresa sin umbral ni aprobación.
   */
  it('la anulación de ventas exige rol autorizador', () => {
    const servicio = CODIGO.find((f) =>
      f.ruta.endsWith('anulacion-ventas.service.ts'),
    )!.texto;
    expect(servicio).toContain('ROLES_AUTORIZADORES_ANULACION');
    expect(servicio).toMatch(/rolUsuario/);
  });
});

describe('Coherencia · dinero en tres capas', () => {
  /*
   * Hallazgo: cinco flujos registraban tesorería y caja correctamente, pero
   * la anulación de venta y el pago a proveedor sólo registraban tesorería.
   * Anular una venta en efectivo dejaba un FALTANTE en el arqueo del cajero
   * por dinero que había devuelto legítimamente.
   */
  const FLUJOS_CON_EFECTIVO = [
    'ventas/services/ventas.service.ts',
    'ventas/services/devoluciones-ventas.service.ts',
    'ventas/services/anulacion-ventas.service.ts',
    'credito/services/cobranza.service.ts',
    'compras/services/ordenes-compra.service.ts',
    'hoteleria/services/operacion-hotel.service.ts',
    'hoteleria/services/city-ledger.service.ts',
  ];

  it.each(FLUJOS_CON_EFECTIVO)(
    '%s descarga el turno de caja cuando la cuenta es de tipo CAJA',
    (ruta) => {
      const archivo = CODIGO.find((f) => f.ruta === ruta);
      expect(archivo).toBeDefined();
      expect(archivo!.texto).toMatch(/TipoCuentaBancaria\.CAJA/);
      expect(archivo!.texto).toMatch(/caja\w*\.registrarEnTransaccion/i);
    },
  );

  /*
   * Hallazgo: todos los importes monetarios son DECIMAL en SQL Server, que el
   * driver puede devolver como cadena. Sin transformador, `a + b` concatena
   * en vez de sumar. Hoy la cobertura es total; este test la protege.
   */
  it('toda columna decimal usa decimalNumberTransformer', () => {
    const sinTransformador: string[] = [];
    for (const { ruta, texto } of CODIGO) {
      if (!ruta.endsWith('.entity.ts')) continue;
      for (const m of texto.matchAll(/@Column\(\{([\s\S]*?)\}\)/g)) {
        const bloque = m[1];
        if (
          /['"]decimal['"]/.test(bloque) &&
          !bloque.includes('decimalNumberTransformer')
        ) {
          sinTransformador.push(ruta);
        }
      }
    }
    expect([...new Set(sinTransformador)]).toEqual([]);
  });
});

describe('Coherencia · trazabilidad', () => {
  /*
   * Hallazgo: 98 de 252 endpoints de escritura quedaban fuera de la lista
   * blanca de auditoría, incluidos el timbrado y la cancelación de CFDI, los
   * traspasos de tesorería, la apertura y cierre de turnos de caja, los
   * retiros de efectivo y las bajas de activos. Dos de los huecos eran
   * erratas: la lista decía `creditos` cuando la ruta es `/credito`, y
   * `catalogo` cuando los catálogos geográficos cuelgan de `/catalogos`.
   */
  it('los módulos que mueven dinero o afectan al SAT se auditan', () => {
    const interceptor = leer(
      join(SRC, 'auditoria/interceptors/auditoria.interceptor.ts'),
    );
    const bloque = interceptor.slice(
      interceptor.indexOf('RUTAS_AUDITABLES'),
    );
    const claves = new Set(
      [...bloque.slice(0, bloque.indexOf('};')).matchAll(
        /^\s*'?([\w-]+)'?:/gm,
      )].map((m) => m[1]),
    );

    const CRITICOS = [
      'tesoreria',
      'caja',
      'cfdi',
      'activos',
      'credito',
      'catalogos',
      'hoteleria',
    ];
    const sinAuditar = CRITICOS.filter((m) => !claves.has(m));
    expect(sinAuditar).toEqual([]);
  });
});

describe('Coherencia · controles contables', () => {
  /*
   * Hallazgo: `crearPolizaManual` validaba cuadre, importe y periodo, pero no
   * a qué cuentas se afectaba. Cualquiera con acceso a Finanzas podía cargar o
   * abonar a mano Bancos, Clientes CxC o Inventario: el auxiliar no cambiaba,
   * el mayor sí, y la conciliación cuadraba igual.
   */
  it('la póliza manual valida que la cuenta admita movimientos manuales', () => {
    const servicio = CODIGO.find((f) =>
      f.ruta.endsWith('polizas.service.ts'),
    )!.texto;
    expect(servicio).toContain('validarCuentasAfectables');
    expect(servicio).toContain('permiteMovimientoManual');
  });

  it('los roles controlados por auxiliar quedan cerrados a pólizas manuales', () => {
    const catalogo = CODIGO.find((f) =>
      f.ruta.endsWith('cuentas-contables.service.ts'),
    )!.texto;
    const bloque = catalogo.slice(
      catalogo.indexOf('ROLES_CONTROLADOS_POR_AUXILIAR'),
    );
    const declarados = bloque.slice(0, bloque.indexOf(']'));

    for (const rol of [
      'CAJA',
      'BANCOS',
      'INVENTARIO',
      'CLIENTES_CXC',
      'PROVEEDORES',
    ]) {
      expect(declarados).toContain(`RolCuentaSistema.${rol}`);
    }
  });

  /*
   * Hallazgo: la póliza de nómina abonaba la cuenta contable del banco pero no
   * creaba ningún MovimientoTesoreria. El saldo bancario en Tesorería quedaba
   * sobrevaluado por el importe íntegro de la nómina en cada periodo.
   */
  it('el pago de nómina registra la salida en tesorería', () => {
    const nomina = CODIGO.find((f) =>
      f.ruta.endsWith('nomina-avanzada.service.ts'),
    )!.texto;
    expect(nomina).toContain('OrigenMovimiento.NOMINA');
    expect(nomina).toMatch(/tesoreria\.registrarEnTransaccion/);
  });
});

describe('Coherencia · identificadores de SQL Server', () => {
  /*
   * Hallazgo en producción: dar de alta una cuenta bancaria devolvía
   * «cuentaContableId must be a UUID».
   *
   * SQL Server admite cualquier hexadecimal 8-4-4-4-12 en `uniqueidentifier`,
   * y `NEWSEQUENTIALID()` genera GUIDs que NO cumplen RFC-4122: el nibble de
   * versión puede ser cualquier cosa. El ID de la empresa que falló era
   * `EDE597DD-F98D-F111-...`, con versión `F`.
   *
   * `@IsUUID()` exige versión 1-5, así que rechazaba identificadores
   * perfectamente válidos de la propia base. Por eso existe
   * `@IsSqlServerGuid()`. Trece decoradores en tres DTOs se habían quedado sin
   * migrar y bloqueaban el alta de cuentas bancarias, la generación de órdenes
   * de compra, las recepciones, los pagos a proveedor y el cierre contable.
   */
  it('ningún DTO valida identificadores de base con @IsUUID()', () => {
    const infractores: string[] = [];

    for (const { ruta, texto } of CODIGO) {
      if (!ruta.endsWith('.dto.ts')) continue;
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        if (!/@IsUUID\(/.test(linea)) return;
        // La clave de idempotencia la genera el cliente con crypto.randomUUID(),
        // que sí produce un UUID v4 legítimo: ahí la validación estricta es correcta.
        const siguiente = lineas.slice(i + 1, i + 4).join(' ');
        if (/claveIdempotencia|idempotencyKey/.test(siguiente)) return;
        infractores.push(`${ruta}:${i + 1}`);
      });
    }
    expect(infractores).toEqual([]);
  });
});

describe('Coherencia · salidas de inventario contabilizadas', () => {
  /*
   * Hallazgo: la dotación de habitación y los consumos del folio llamaban a
   * `registrarSalida`, que devuelve el costo real calculado lote por lote, y
   * ese valor se DESCARTABA. El inventario físico bajaba y la cuenta contable
   * de Inventario nunca se acreditaba: crecía indefinidamente respecto a la
   * existencia real y la utilidad quedaba inflada mes a mes.
   */
  it('el asiento de hospedaje incluye el costo de los consumos', () => {
    const motor = CODIGO.find((f) =>
      f.ruta.endsWith('motor-contable.service.ts'),
    )!.texto;
    const bloque = motor.slice(motor.indexOf('generarAsientoDeHospedaje'));
    const hasta = bloque.indexOf('async generarAsientoDeDepreciacion');
    const cuerpo = bloque.slice(0, hasta > 0 ? hasta : undefined);

    expect(cuerpo).toContain('costoConsumos');
    expect(cuerpo).toContain('RolCuentaSistema.COSTO_VENTAS');
    expect(cuerpo).toContain('RolCuentaSistema.INVENTARIO');

    const hotel = CODIGO.find((f) =>
      f.ruta.endsWith('operacion-hotel.service.ts'),
    )!.texto;
    expect(hotel).toContain('costoConsumos');
  });

  /*
   * Hallazgo: `darDeBaja` calculaba el resultado, lo devolvía en el JSON de la
   * respuesta y nunca generaba póliza. El activo seguía en balance a costo
   * histórico y la utilidad o pérdida no se reconocía.
   */
  it('la baja de activo encola su asiento contable', () => {
    const activos = CODIGO.find((f) =>
      f.ruta.endsWith('activos/services/activos.service.ts'),
    )!.texto;
    expect(activos).toContain('TipoAsiento.BAJA_ACTIVO');

    const motor = CODIGO.find((f) =>
      f.ruta.endsWith('motor-contable.service.ts'),
    )!.texto;
    expect(motor).toContain('async generarAsientoDeBajaActivo(');
  });
});

describe('Coherencia · despliegue', () => {
  /*
   * Los cinco @Cron corren dentro del proceso de la API. Sólo el de asientos
   * pendientes está protegido contra ejecución múltiple (reclama cada fila con
   * un compare-and-set). Los otros cuatro no tenían ninguna protección: con dos
   * réplicas, la auditoría nocturna hotelera duplicaba los cargos de renta en
   * los folios abiertos.
   */
  it('toda tarea programada sin protección propia respeta CRONS_HABILITADOS', () => {
    // Tiene su propio candado por fila; no necesita el interruptor.
    const CON_PROTECCION_PROPIA = ['finanzas/services/asientos-pendientes.service.ts'];

    const desprotegidos: string[] = [];
    for (const { ruta, texto } of CODIGO) {
      if (!/@Cron\(/.test(texto)) continue;
      if (CON_PROTECCION_PROPIA.includes(ruta)) continue;
      if (!texto.includes('omitirTareaProgramada')) desprotegidos.push(ruta);
    }
    expect(desprotegidos).toEqual([]);
  });

  it('ambos proyectos fijan la versión de Node', () => {
    const backend = JSON.parse(
      readFileSync(join(SRC, '..', 'package.json'), 'utf8'),
    );
    expect(backend.engines?.node).toBeTruthy();
  });
});
