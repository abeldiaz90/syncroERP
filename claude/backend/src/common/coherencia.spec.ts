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
import { join, relative, sep} from 'path';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';
import { ENDPOINTS_NAVEGABLES } from '../iam/data/endpoints-navegables';
import { moduloDeRuta, MODULOS_ASIGNABLES, MODULOS_POR_ID } from '../iam/data/modulos-catalogo';
import { MODULOS_NEGOCIO } from '../iam/data/modulos-catalogo';
import { ROLES_CON_TRAZA_COMPLETA } from '../aprobaciones/services/aprobaciones-documentos.service';

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
/*
 * ============================================================================
 * Las rutas se normalizan a barras
 * ----------------------------------------------------------------------------
 * `relative()` devuelve `iam\data\x.ts` en Windows y `iam/data/x.ts` en Linux,
 * y esta especificación compara rutas con cadenas escritas con barras. En
 * Windows —que es donde se corre— fallaban nueve casos sin que ninguno fuera un
 * defecto del sistema: la comparación del mapa de endpoints navegables y los
 * ocho de «dinero en tres capas», que buscaban archivos por una ruta que en esa
 * máquina nunca coincidía.
 *
 * El efecto era peor que un falso negativo: esta especificación existe para
 * vigilar reglas que no se ven leyendo un archivo suelto, y llevaba tiempo en
 * rojo por un separador, así que sus hallazgos de verdad —tres, y reales— se
 * perdían entre el ruido.
 * ============================================================================
 */
const CODIGO = TODOS.filter((f) => !f.endsWith('.spec.ts')).map((f) => ({
  ruta: relative(SRC, f).split(sep).join('/'),
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
    /*
     * Las portadas de módulo quedan fuera: no son una pantalla con datos, son
     * la tapa del módulo. Y no deben tener acción propia, porque el permiso de
     * pantalla cubre los descendientes y conceder la portada concedería el
     * árbol entero —fue exactamente lo que pasó con `/dashboard/reportes`—. Se
     * entra a ellas si se puede abrir algo de dentro, y eso lo resuelve el
     * layout, no la tabla de permisos.
     */
    const contenedores = new Set(
      [
        ...(menu.split('RUTAS_CONTENEDOR')[1] ?? '')
          .split(']')[0]
          .matchAll(/"([^"]+)"/g),
      ].map((m) => m[1]),
    );
    const hrefs = [...menu.matchAll(/href:\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => !h.startsWith('/dashboard/centros') && !contenedores.has(h));

    const mapa = leer(join(SRC, 'iam/data/endpoints-navegables.ts'));
    /*
     * Cuentan `rutaFrontend` y también `rutasAdicionales`: una misma acción
     * puede habilitar más de una pantalla. El caso real es la caja, que vive en
     * `/pos` y dejó `/dashboard/ventas/pos` como página que redirige para quien
     * la tenga en favoritos — las dos las habilita poder registrar una venta.
     */
    const cubiertas = new Set([
      ...[...mapa.matchAll(/rutaFrontend:\s*'([^']+)'/g)].map((m) => m[1]),
      ...[...mapa.matchAll(/rutasAdicionales:\s*\[([^\]]*)\]/g)].flatMap((m) =>
        [...m[1].matchAll(/'([^']+)'/g)].map((r) => r[1]),
      ),
    ]);
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

  /*
   * Hallazgo al usar la pantalla: dar de alta un proveedor fallaba con
   * «email: email must be an email» señalando el correo que el usuario había
   * dejado en blanco a propósito —el formulario dice, con razón, que basta con
   * capturar el de la empresa o el del contacto.
   *
   * `@IsOptional()` omite la validación con `undefined` o `null`, no con
   * cadena vacía, y un `<input>` que nadie tocó vale `''`. Por eso existe
   * `@IsEmailOpcional`, hermano de `@IsSqlServerGuidOpcional`.
   */
  it('ningún DTO valida correos opcionales con @IsOptional() + @IsEmail()', () => {
    const infractores: string[] = [];

    for (const { ruta, texto } of CODIGO) {
      if (!ruta.endsWith('.dto.ts')) continue;
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        const mismaLinea = /@IsOptional\(\)\s*@IsEmail\(/.test(linea);
        const dosLineas =
          /@IsOptional\(\)\s*$/.test(linea) &&
          /^\s*@IsEmail\(/.test(lineas[i + 1] ?? '');
        if (mismaLinea || dosLineas) infractores.push(`${ruta}:${i + 1}`);
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

describe('Coherencia · bloqueos pesimistas', () => {
  /*
   * PostgreSQL rechaza `FOR UPDATE` cuando la consulta trae un LEFT JOIN:
   * "FOR UPDATE cannot be applied to the nullable side of an outer join".
   * Cuatro servicios lo hacían (resolver aprobación de requisición, generar
   * orden de compra desde cotización, cerrar conteo de inventario y anular
   * venta) y cada uno devolvía 500 en vez de operar. La forma correcta es
   * bloquear únicamente la tabla raíz: setLock(modo, undefined, ['alias']).
   */
  it('ningún setLock convive con un join sin acotar las tablas bloqueadas', () => {
    const infractores: string[] = [];
    for (const { ruta, texto } of CODIGO) {
      if (ruta.endsWith('.spec.ts')) continue;
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        if (!/setLock\(/.test(linea)) return;
        if (/setLock\([^)]*,\s*undefined\s*,\s*\[/.test(linea)) return;
        // Sólo la sentencia que contiene el setLock: se abre en la línea que
        // arranca la consulta y se cierra en el primer `;`.
        let inicio = i;
        while (inicio > 0 && !/;|=\s*await|=\s*em\.|=\s*this\./.test(lineas[inicio - 1])) {
          inicio -= 1;
        }
        let fin = i;
        while (fin < lineas.length - 1 && !lineas[fin].includes(';')) fin += 1;
        const cadena = lineas.slice(inicio - 1 >= 0 ? inicio - 1 : 0, fin + 1).join('\n');
        if (/\.(left|inner)Join(AndSelect)?\(/.test(cadena)) {
          infractores.push(`${ruta}:${i + 1}`);
        }
      });
    }
    expect(infractores).toEqual([]);
  });
});

describe('Coherencia · identificadores opcionales en DTOs', () => {
  /*
   * Un `<select>` en blanco manda cadena vacía, no `undefined`. `@IsOptional()`
   * sólo perdona `undefined` y `null`, así que la cadena vacía llegaba hasta
   * PostgreSQL y reventaba al escribirla en una columna uuid, con el mensaje
   * genérico «El identificador o alguno de los valores no tiene el formato
   * esperado», que no nombra ningún campo. Doce identificadores opcionales
   * estaban así: dar de alta un usuario sin área, un producto sin categoría o
   * una categoría sin cuenta contable era imposible.
   *
   * `@IsSqlServerGuidOpcional()` convierte la cadena vacía en ausencia antes de
   * validar. Un `@Transform` propio que haga lo mismo también vale.
   */
  it('todo identificador opcional normaliza la cadena vacía', () => {
    const infractores: string[] = [];
    for (const { ruta, texto } of CODIGO) {
      if (!ruta.endsWith('.dto.ts')) continue;
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        const propiedad = /^\s*(\w+)\??:\s*string;?\s*$/.exec(linea);
        if (!propiedad || !propiedad[1].endsWith('Id')) return;
        let j = i - 1;
        const decoradores: string[] = [];
        while (j >= 0 && /^\s*(@|\/\/|\*|\/\*)/.test(lineas[j])) {
          decoradores.unshift(lineas[j].trim());
          j -= 1;
        }
        const bloque = decoradores.join('\n');
        if (!bloque.includes('@IsOptional()')) return;
        if (bloque.includes('Guid') || bloque.includes('Transform')) return;
        infractores.push(`${ruta}:${i + 1} ${propiedad[1]}`);
      });
    }
    expect(infractores).toEqual([]);
  });
});

describe('Coherencia · contrato de roles', () => {
  /*
   * ==========================================================================
   * Lo que cada puesto SIEMPRE puede y NUNCA puede
   * --------------------------------------------------------------------------
   * Las plantillas declaran módulos, y un módulo es un conjunto que cambia:
   * la recepción de mercancía se reclasificó de «Compras» a «Inventario» y las
   * empresas ya sembradas se quedaron con la acción apagada —78 de 79— hasta
   * que un almacenista se quedó con el camión en la puerta y un 403 al firmar.
   *
   * Por eso lo que define un puesto se declara por RUTA, que no cambia, y se
   * repone en cada escritura y en cada arranque. Estas pruebas cuidan que esas
   * declaraciones sigan apuntando a endpoints que existen: un contrato que
   * nombra una ruta renombrada es un contrato mudo, y falla en silencio.
   * ==========================================================================
   */
  const plantillas = PLANTILLAS_PERMISOS;
  const rutas = rutasDelBackend();

  it('toda acción irrenunciable o vedada apunta a un endpoint real', () => {
    const huerfanas: string[] = [];
    for (const p of plantillas) {
      for (const accion of [
        ...(p.accionesIrrenunciables ?? []),
        ...(p.accionesVedadas ?? []),
      ]) {
        if (!rutas.has(accion)) huerfanas.push(`${p.rol}: ${accion}`);
      }
    }
    expect(huerfanas).toEqual([]);
  });

  it('ninguna acción es a la vez irrenunciable y vedada para el mismo rol', () => {
    const choques: string[] = [];
    for (const p of plantillas) {
      const vedadas = new Set(p.accionesVedadas ?? []);
      for (const a of p.accionesIrrenunciables ?? []) {
        if (vedadas.has(a)) choques.push(`${p.rol}: ${a}`);
      }
    }
    expect(choques).toEqual([]);
  });

  it('el almacén conserva la recepción de mercancía', () => {
    const almacenista = plantillas.find((p) => p.rol === 'almacenista');
    expect(almacenista?.accionesIrrenunciables).toContain(
      'PATCH /compras/ordenes/:id/recibir',
    );
  });

  it('alg\u00fan rol distinto del administrador puede pagar al proveedor', () => {
    /*
     * Al vedarle el pago al comprador se cerr\u00f3 un hueco de separaci\u00f3n de
     * funciones y se abri\u00f3 otro: ning\u00fan rol ten\u00eda el m\u00f3dulo «compras»
     * completo, as\u00ed que no quedaba nadie capaz de pagar salvo el admin. Un
     * control que deja el trabajo sin hacer no es un control, es una aver\u00eda.
     */
    const PAGAR = 'PATCH /compras/ordenes/:id/pagar';
    const pueden = plantillas.filter((p) =>
      (p.accionesIrrenunciables ?? []).includes(PAGAR),
    );
    expect(pueden.map((p) => p.rol).sort()).toEqual(['finanzas', 'tesoreria']);

    const vedado = plantillas.filter((p) => (p.accionesVedadas ?? []).includes(PAGAR));
    expect(vedado.map((p) => p.rol)).toEqual(['comprador']);
  });

  it('el comprador no puede pagar ni autorizar lo que él mismo compra', () => {
    const comprador = plantillas.find((p) => p.rol === 'comprador');
    expect(comprador?.accionesVedadas).toEqual(
      expect.arrayContaining([
        'PATCH /compras/ordenes/:id/pagar',
        'PATCH /compras/requisiciones/aprobaciones/:id',
      ]),
    );
  });

  it('quien puede ejecutar una acci\u00f3n tambi\u00e9n puede ver sobre qu\u00e9 la ejecuta', () => {
    /*
     * Una acci\u00f3n sin su consulta es una pantalla vac\u00eda con un bot\u00f3n: al
     * almacenista se le dio ver el manifiesto sin poder firmarlo, y a
     * tesorer\u00eda lo contrario —pod\u00eda firmar el pago y `GET /compras/ordenes`
     * le daba 403, as\u00ed que la lista de lo que deb\u00eda pagar sal\u00eda vac\u00eda.
     */
    const LECTURA_EXIGIDA: Record<string, string[]> = {
      'PATCH /compras/ordenes/:id/pagar': ['GET /compras/ordenes', 'GET /compras/ordenes/:id'],
      'PATCH /compras/ordenes/:id/recibir': ['GET /compras/ordenes/:id'],
    };

    const faltantes: string[] = [];
    for (const p of plantillas) {
      const declaradas = new Set(p.accionesIrrenunciables ?? []);
      for (const [accion, lecturas] of Object.entries(LECTURA_EXIGIDA)) {
        if (!declaradas.has(accion)) continue;
        for (const lectura of lecturas) {
          const porModulo = (p.modulosConsulta ?? []).length > 0 || p.modulos.length > 0;
          if (!declaradas.has(lectura) && !porModulo) {
            faltantes.push(`${p.rol}: ${accion} sin ${lectura}`);
          }
        }
      }
    }
    expect(faltantes).toEqual([]);

    // Y explicitamente: los dos roles que pagan declaran su lectura por ruta.
    for (const rol of ['tesoreria', 'finanzas']) {
      const p = plantillas.find((x) => x.rol === rol)!;
      expect(p.accionesIrrenunciables).toEqual(
        expect.arrayContaining(['GET /compras/ordenes', 'GET /compras/ordenes/:id']),
      );
    }
  });

  it('el contrato se aplica en la escritura y en el arranque, no sólo al sembrar', () => {
    const servicio = CODIGO.find((f) =>
      f.ruta.endsWith('iam/services/permisos-dinamicos.service.ts'),
    )!.texto;
    // En la única puerta de escritura de la tabla de permisos.
    expect(servicio).toMatch(/async actualizarPermisos[\s\S]*?accionesIrrenunciables/);
    // Y reconciliado al levantar, para instalaciones sembradas antes.
    expect(servicio).toContain('aplicarContratoDeRoles');
    expect(servicio).toMatch(
      /sincronizarControladoresYEndpoints[\s\S]*?aplicarContratoDeRoles\(\)/,
    );
  });
});

describe('Coherencia · los roles nacen con lo suyo', () => {
  /*
   * ==========================================================================
   * Un rol se amplía; no se recorta por debajo de su trabajo
   * --------------------------------------------------------------------------
   * Quitarle a un rol una acción con la que opera —el almacenista sin recibir
   * mercancía, el cajero sin cobrar, el contador sin pólizas— no produce un rol
   * más restringido, produce un rol roto. Y el que lo rompe casi nunca es
   * quien descubre el estropicio: lo descubre el que llega el lunes y no puede
   * trabajar, sin saber qué cambió ni cuándo.
   *
   * Por eso el piso no es una convención de la pantalla, es código en la única
   * puerta de escritura de la tabla de permisos. Estas pruebas cuidan que siga
   * ahí.
   * ==========================================================================
   */
  const servicio = () =>
    CODIGO.find((f) => f.ruta.endsWith('iam/services/permisos-dinamicos.service.ts'))!
      .texto;

  it('el piso abarca todo lo que la plantilla concede, no sólo la consulta', () => {
    const texto = servicio();
    expect(texto).toContain('pisoDeAccionesDeRol');
    // Los módulos propios entran enteros...
    expect(texto).toMatch(
      /pisoDeAccionesDeRol[\s\S]*?for \(const moduloId of plantilla\.modulos\)[\s\S]*?protegidos\.add\(ep\.id\)/,
    );
    // ...y de los de consulta, sus GET.
    expect(texto).toMatch(
      /pisoDeAccionesDeRol[\s\S]*?modulosConsulta[\s\S]*?esConsulta\(ep\)[\s\S]*?protegidos\.add\(ep\.id\)/,
    );
  });

  it('la escritura de permisos repone lo que se intente quitar del piso', () => {
    expect(servicio()).toMatch(
      /async actualizarPermisos[\s\S]*?pisoDeAccionesDeRol[\s\S]*?permisos\[id\] = true/,
    );
  });

  it('asignar módulos no degrada a consulta el trabajo propio del rol', () => {
    const texto = servicio();
    expect(texto).toMatch(
      /for \(const moduloId of piso\)[\s\S]*?efectivos\[moduloId\] = 'completo'/,
    );
  });

  it('ningún rol con plantilla se puede borrar: no existe esa puerta', () => {
    const controladores = CODIGO.filter(
      (f) => f.ruta.startsWith('iam/') && f.ruta.endsWith('.controller.ts'),
    );
    const conBorrado = controladores.filter((f) => /@Delete\(/.test(f.texto));
    expect(conBorrado.map((f) => f.ruta)).toEqual([]);
  });

  it('toda plantilla declara al menos un módulo propio', () => {
    const vacias = PLANTILLAS_PERMISOS.filter((p) => p.modulos.length === 0);
    expect(vacias.map((p) => p.rol)).toEqual([]);
  });
});


describe('Coherencia · el mapa del menú no regala pantallas vecinas', () => {
  /*
   * ==========================================================================
   * Una pantalla concedida no puede abrir la de al lado
   * --------------------------------------------------------------------------
   * El permiso de pantalla cubre la ruta Y SUS DESCENDIENTES. Eso es
   * deliberado y necesario: quien puede abrir `/dashboard/compras/ordenes`
   * tiene que poder abrir el detalle de una orden, que cuelga de ahí.
   *
   * El efecto secundario es que conceder una portada concede el árbol entero,
   * y eso deja de ser inocente en cuanto las hojas son de OTRO módulo de
   * negocio. Pasó con `/dashboard/reportes`: la acción que lo concedía era la
   * métrica del catálogo de productos —la tiene el almacenista— y por debajo
   * cuelgan el panel ejecutivo, el corte de caja y el estado de cuenta de los
   * clientes. Y con `/dashboard/hoteleria`, que cuelga el escandallo y el
   * costo teórico contra real de Recetas.
   *
   * La regla, entonces, no es «ninguna ruta puede ser padre de otra» —eso
   * rompería el detalle de la orden—, es: **ninguna ruta puede ser padre de
   * una ruta de otro módulo**. Dentro de un módulo el permiso ya viaja junto;
   * entre módulos, no debe.
   * ==========================================================================
   */
  const porRuta = new Map<string, Set<string>>();
  for (const [clave, meta] of Object.entries(ENDPOINTS_NAVEGABLES)) {
    const modulo = moduloDeRuta(clave.split(' ')[1]);
    for (const ruta of [meta.rutaFrontend, ...(meta.rutasAdicionales ?? [])]) {
      if (!porRuta.has(ruta)) porRuta.set(ruta, new Set());
      porRuta.get(ruta)!.add(modulo);
    }
  }

  it('ninguna pantalla es antecesora de otra de un módulo distinto', () => {
    const rutas = [...porRuta.keys()];
    const invasiones: string[] = [];
    for (const padre of rutas) {
      for (const hija of rutas) {
        if (padre === hija || !hija.startsWith(padre + '/')) continue;
        const suyos = porRuta.get(padre)!;
        const ajenos = [...porRuta.get(hija)!].filter((m) => !suyos.has(m));
        if (ajenos.length) {
          invasiones.push(`${padre} [${[...suyos]}] abre ${hija} [${ajenos}]`);
        }
      }
    }
    expect(invasiones).toEqual([]);
  });
});

describe('Coherencia · las cuentas contables no se tocan desde el almacén', () => {
  /*
   * ==========================================================================
   * Quién decide a qué cuenta va cada familia de productos
   * --------------------------------------------------------------------------
   * Las cinco cuentas de una categoría —ventas, costo, inventario,
   * devoluciones, mermas— son las que el motor contable usa para armar el
   * asiento de cada venta y de cada salida de almacén. Se editaban en el PATCH
   * general de la categoría, que pertenece al módulo de Inventario y que el
   * almacenista tiene completo. Nadie lo hizo con mala intención y nadie se
   * habría enterado: el desajuste aparece en el cierre, semanas después.
   *
   * Ahora cuelgan de `/catalogo/categorias/:id/cuentas`, un prefijo declarado
   * dentro de Contabilidad. Estas pruebas cuidan que no vuelvan.
   * ==========================================================================
   */
  it('las cuentas de una categoría pertenecen a Contabilidad', () => {
    expect(moduloDeRuta('/catalogo/categorias/:id/cuentas')).toBe('finanzas');
    expect(moduloDeRuta('/catalogo/categorias/auto-configurar')).toBe('finanzas');
    // El catálogo en sí sigue siendo del almacén.
    expect(moduloDeRuta('/catalogo/categorias/:id')).toBe('inventario');
    expect(moduloDeRuta('/catalogo/categorias')).toBe('inventario');
  });

  it('el DTO del catálogo ya no acepta cuentas contables', () => {
    const dto = CODIGO.find((f) =>
      f.ruta.endsWith('catalogo/dto/crear-categoria.dto.ts'),
    )!.texto;
    expect(dto).not.toMatch(/cuenta(Ventas|CostoVentas|Inventario|Devoluciones|Mermas)Id/);
  });

  it('quien mapea cuentas puede ver las categorías que va a mapear', () => {
    for (const rol of ['contador', 'finanzas']) {
      const plantilla = PLANTILLAS_PERMISOS.find((p) => p.rol === rol)!;
      const puedeVer =
        (plantilla.accionesIrrenunciables ?? []).includes('GET /catalogo/categorias') ||
        plantilla.modulos.includes('inventario') ||
        (plantilla.modulosConsulta ?? []).includes('inventario');
      expect([rol, puedeVer]).toEqual([rol, true]);
    }
  });
});


describe('Coherencia · lo que se le retira a un rol queda escrito', () => {
  /*
   * ==========================================================================
   * Un módulo no se quita borrándolo de la plantilla
   * --------------------------------------------------------------------------
   * La reconciliación de arranque sólo ENCIENDE, nunca apaga, para que una
   * ampliación hecha a mano sobreviva al reinicio. La consecuencia es que
   * quitar un módulo de `modulosConsulta` no retira nada en las empresas ya
   * sembradas: se queda encendido para siempre y sólo se nota revisando la
   * matriz acción por acción. Pasó al sacarle «precios» al almacenista.
   *
   * Por eso la retirada se declara —`modulosVedados`— y se aplica en las dos
   * puertas: el arranque y cada escritura de permisos.
   * ==========================================================================
   */
  const servicio = () =>
    CODIGO.find((f) => f.ruta.endsWith('iam/services/permisos-dinamicos.service.ts'))!
      .texto;

  it('existe el techo por módulo y se aplica en cada escritura', () => {
    const texto = servicio();
    expect(texto).toContain('techoDeModulosVedados');
    expect(texto).toMatch(
      /async actualizarPermisos[\s\S]*?techoDeModulosVedados[\s\S]*?permisos\[id\] = false/,
    );
  });

  it('el arranque retira lo vedado, no sólo repone lo irrenunciable', () => {
    expect(servicio()).toMatch(
      /aplicarContratoDeRoles[\s\S]*?techoDeModulosVedados[\s\S]*?fila\.permitido = false/,
    );
  });

  it('el piso nunca repone algo que el techo veda', () => {
    const texto = servicio();
    const veces = texto.match(/techoDeModulosVedados\(\w+(?:\.\w+)?\)\) (?:protegidos|piso)\.delete/g) ?? [];
    expect(veces.length).toBe(2);
  });

  it('ningún módulo está a la vez concedido y vedado', () => {
    const contradicciones = PLANTILLAS_PERMISOS.filter((p) => {
      const tiene = new Set([...p.modulos, ...(p.modulosConsulta ?? [])]);
      return (p.modulosVedados ?? []).some((m) => tiene.has(m));
    });
    expect(contradicciones.map((p) => p.rol)).toEqual([]);
  });
});


describe('Coherencia · los guardas de la interfaz nombran acciones que existen', () => {
  /*
   * ==========================================================================
   * Un botón que se esconde para siempre y no avisa
   * --------------------------------------------------------------------------
   * La interfaz decide si pinta un botón preguntando `tienePermiso(metodo,
   * ruta)` contra el mapa que devuelve `/auth/mis-permisos`, cuyas llaves son
   * literalmente «METODO /ruta» tal como el controlador las declara. Si el
   * guarda nombra un verbo distinto del real, la pregunta no encuentra llave,
   * devuelve false, y el botón simplemente no se dibuja. No hay error en
   * consola, no hay 403, no hay nada: la función existe, el usuario tiene el
   * permiso, y la pantalla se comporta como si no lo tuviera.
   *
   * Pasó con la edición de productos: la ficha se guarda con
   * `PUT /catalogo/productos/:id` y el guarda pedía `PATCH`. El almacenista
   * —que es el único rol que da de alta productos— no podía editar ninguno, y
   * revisar los permisos por API no lo mostraba, porque por API el permiso
   * estaba concedido. Sólo se ve abriendo la pantalla.
   *
   * Por eso esta prueba lee los guardas del frontend y los contrasta contra
   * las rutas declaradas en los controladores de Nest.
   * ==========================================================================
   */
  const ALIAS: Record<string, string> = {
    PuedeVer: 'GET',
    PuedeCrear: 'POST',
    PuedeEditar: 'PATCH',
    PuedeEliminar: 'DELETE',
  };
  const norm = (r: string) =>
    r.replace(/^\/api/, '').replace(/\/$/, '').replace(/:[^/]+/g, ':p') || '/';

  /** Rutas declaradas en los controladores, por verbo. */
  const porVerbo = (() => {
    const mapa = new Map<string, Set<string>>();
    for (const f of CODIGO.filter((x) => x.ruta.endsWith('.controller.ts'))) {
      const mc = f.texto.match(/@Controller\(\s*['\"]([^'\"]*)['\"]\s*\)/);
      const base = mc ? mc[1] : '';
      const re = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['\"]([^'\"]*)['\"])?\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.texto))) {
        const ruta =
          ('/' + [base, m[2] ?? ''].filter(Boolean).join('/'))
            .replace(/\/+/g, '/')
            .replace(/\/$/, '') || '/';
        const verbo = m[1].toUpperCase();
        if (!mapa.has(verbo)) mapa.set(verbo, new Set());
        mapa.get(verbo)!.add(norm(ruta));
      }
    }
    return mapa;
  })();

  it('cada guarda del frontend corresponde a un endpoint real', () => {
    if (!FRONTEND) return; // el frontend no está junto al backend en este entorno

    const archivos: Array<{ ruta: string; texto: string }> = [];
    const recorrer = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === '.next' || nombre.startsWith('.')) continue;
        const completo = join(dir, nombre);
        if (statSync(completo).isDirectory()) recorrer(completo);
        else if (/\.tsx?$/.test(nombre)) {
          archivos.push({
            ruta: relative(FRONTEND, completo).split(sep).join('/'),
            texto: readFileSync(completo, 'utf8'),
          });
        }
      }
    };
    recorrer(join(FRONTEND, 'app'));
    recorrer(join(FRONTEND, 'components'));

    const rotos: string[] = [];
    for (const f of archivos) {
      // El propio componente documenta su uso con ejemplos: no son guardas.
      if (f.ruta.endsWith('components/ProtectedElement.tsx')) continue;
      const guardas: Array<{ metodo: string; ruta: string }> = [];
      let m: RegExpExecArray | null;

      const conMetodo = /<ProtectedElement\b[^>]*?metodo=[\"'](\w+)[\"'][^>]*?ruta=[\"']([^\"']+)[\"']/gs;
      while ((m = conMetodo.exec(f.texto))) guardas.push({ metodo: m[1].toUpperCase(), ruta: m[2] });
      const alReves = /<ProtectedElement\b[^>]*?ruta=[\"']([^\"']+)[\"'][^>]*?metodo=[\"'](\w+)[\"']/gs;
      while ((m = alReves.exec(f.texto))) guardas.push({ metodo: m[2].toUpperCase(), ruta: m[1] });
      for (const [alias, metodo] of Object.entries(ALIAS)) {
        const re = new RegExp(`<${alias}\\b[^>]*?ruta=[\"']([^\"']+)[\"']`, 'gs');
        while ((m = re.exec(f.texto))) guardas.push({ metodo, ruta: m[1] });
      }

      for (const g of guardas) {
        const verbosReales = [...porVerbo.entries()]
          .filter(([, rutas]) => rutas.has(norm(g.ruta)))
          .map(([verbo]) => verbo);
        if (!verbosReales.length) {
          rotos.push(`${f.ruta}: ${g.metodo} ${g.ruta} — ningún controlador declara esa ruta`);
        } else if (!verbosReales.includes(g.metodo)) {
          rotos.push(
            `${f.ruta}: ${g.metodo} ${g.ruta} — el verbo real es ${verbosReales.join('/')}`,
          );
        }
      }
    }
    expect(rotos).toEqual([]);
  });
});


describe('Coherencia · los secretos del usuario no salen por la API', () => {
  /*
   * ==========================================================================
   * Una promesa en un comentario no es una defensa
   * --------------------------------------------------------------------------
   * `passwordHash` llevaba `@Exclude()` y encima un comentario que decía
   * «NUNCA DEVOLVERÁ EL HASH AL FRONTEND». Era falso: `@Exclude()` sólo actúa
   * si está registrado el `ClassSerializerInterceptor` de Nest, y no lo estaba
   * en ninguna parte. El servicio de usuarios limpiaba la respuesta a mano
   * —así que `/usuarios` salía bien y el bug parecía no existir—, pero
   * cualquier otro servicio que cargue la relación `usuario` devuelve la
   * entidad entera: `GET /configuraciones-aprobacion/matriz/todos` entregaba el
   * hash de cada aprobador a cualquier rol que pudiera consultar aprobaciones.
   *
   * La defensa está ahora en la capa de datos: la columna no se carga. Lo mismo
   * para el token de invitación y el de recuperación, con los que se activa o
   * se secuestra una cuenta ajena.
   * ==========================================================================
   */
  const entidad = () =>
    CODIGO.find((f) => f.ruta.endsWith('iam/entities/usuario.entity.ts'))!.texto;

  it('el hash y los tokens no se cargan en consultas ordinarias', () => {
    const texto = entidad();
    for (const campo of ['passwordHash', 'tokenVerificacion', 'tokenRecuperacion']) {
      const decorador = new RegExp(`@Column\\(\\{[^}]*select: false[^}]*\\}\\)[\\s\\S]{0,400}?\\b${campo}!`);
      expect([campo, decorador.test(texto)]).toEqual([campo, true]);
    }
  });

  it('sólo el login pide el hash, y lo pide explícitamente', () => {
    const lectores = CODIGO.filter(
      (f) => !f.ruta.endsWith('usuario.entity.ts') && /addSelect\(['"]u\.passwordHash['"]\)/.test(f.texto),
    ).map((f) => f.ruta);
    expect(lectores).toEqual(['iam/services/auth.service.ts']);
  });

  it('nadie confía en @Exclude mientras no exista el interceptor que lo aplica', () => {
    const hayInterceptor = CODIGO.some((f) =>
      /ClassSerializerInterceptor/.test(f.texto),
    );
    if (hayInterceptor) return; // si algún día se registra, esta prueba sobra
    /*
     * Sin el interceptor, `@Exclude()` es decoración. Que nadie añada un campo
     * sensible creyendo que con eso basta: la lista de campos protegidos de
     * verdad es la de `select: false` de la prueba anterior.
     */
    const entidadesConExclude = CODIGO.filter(
      (f) => f.ruta.endsWith('.entity.ts') && /@Exclude\(\)/.test(f.texto),
    );
    for (const f of entidadesConExclude) {
      const camposExcluidos = [
        ...f.texto.matchAll(/@Exclude\(\)[\s\S]{0,200}?(\w+)!/g),
      ].map((m) => m[1]);
      for (const campo of camposExcluidos) {
        const protegido = new RegExp(
          `@Column\\(\\{[^}]*select: false[^}]*\\}\\)[\\s\\S]{0,600}?\\b${campo}!`,
        );
        expect([f.ruta, campo, protegido.test(f.texto)]).toEqual([f.ruta, campo, true]);
      }
    }
  });
});

/*
 * ============================================================================
 * Hallazgos de la corrida del rol Comprador (21-sep-2026)
 * ----------------------------------------------------------------------------
 * Los cuatro se encontraron probando por pantalla con un usuario real, no
 * leyendo codigo, y ninguno lo habria detectado una prueba de modulo: los
 * cuatro viven en la costura entre el contrato de roles y lo que cada consulta
 * devuelve o cada pantalla ofrece.
 * ============================================================================
 */
describe('Coherencia · lo que un endpoint devuelve, no solo a quien deja entrar', () => {
  it('el historial de aprobaciones se recorta por persona, no solo por empresa', () => {
    /*
     * GET /aprobaciones/historial recibia unicamente empresaId y devolvia las
     * aprobaciones de TODOS los modulos a cualquiera que alcanzara la pantalla.
     * El comprador -que llega ahi legitimamente- leia una solicitud de credito
     * de cliente con nombre, RFC, limite y nivel de riesgo.
     *
     * El permiso de ruta no puede arreglar esto: la ruta si le corresponde, los
     * renglones no. El recorte tiene que estar en la consulta.
     */
    const controlador = leer(
      join(SRC, 'aprobaciones/controllers/aprobaciones-documentos.controller.ts'),
    );
    const historial = controlador.slice(controlador.indexOf("@Get('historial')"));
    const cuerpo = historial.slice(0, historial.indexOf('@Patch'));
    expect(cuerpo).toContain("@ActiveUser('id')");
    expect(cuerpo).toContain("@ActiveUser('rol')");
    expect(cuerpo).toMatch(/listarHistorial\([^)]*usuarioId[^)]*rol/s);
  });

  it('la requisicion no publica el expediente de quien la firma', () => {
    /*
     * La relacion aprobaciones.usuario devolvia el registro completo de
     * Usuario: correo, keycloakSubject, esPropietario, intentosFallidos y los
     * vencimientos de token del administrador de la empresa. `select: false`
     * cubrio la credencial; el resto salia arrastrado por la relacion.
     */
    const servicio = leer(join(SRC, 'compras/services/requisiciones.service.ts'));
    const publicadas = servicio
      .slice(
        servicio.indexOf('const PERSONA_EN_REQUISICION'),
        servicio.indexOf('const SELECCION_REQUISICION'),
      )
      .match(/^\s*(\w+):\s*true,/gm)
      ?.map((linea) => linea.trim().split(':')[0]);
    expect(publicadas?.sort()).toEqual(['id', 'nombreCompleto', 'rol']);
    // Y el recorte se aplica en las DOS consultas: listado y detalle.
    expect(servicio.split('select: SELECCION_REQUISICION').length - 1).toBe(2);
  });

  it('los catalogos de referencia se leen sin pedir permiso de rol', () => {
    /*
     * Paises, estados, bancos, formas de pago y codigos postales son la lista
     * contra la que se llena cualquier formulario con domicilio o datos de
     * pago. Mientras se resolvian por el contrato de roles, el comprador
     * -que es quien mantiene el padron de proveedores- abria el alta con los
     * combos Pais, Estado y Forma de Pago VACIOS estando marcados como
     * obligatorios: el proveedor no se podia dar de alta.
     *
     * Que se leen sin permiso es una regla del sistema. Concederlos rol por rol
     * garantiza que el proximo rol nazca roto.
     */
    const sinSkip: string[] = [];
    for (const archivo of [
      'paises',
      'estados',
      'bancos',
      'formas-pago',
      'codigos-postales',
    ]) {
      const ruta = join(SRC, `catalogo/controllers/${archivo}.controller.ts`);
      if (!existsSync(ruta)) continue;
      const texto = leer(ruta);
      // Cada @Get de lectura debe ir precedido por @SkipPermisos(), salvo los
      // que exigen administrador de plataforma dentro del metodo.
      const bloques = texto.split('@Get');
      for (const b of bloques.slice(1)) {
        const cuerpo = b.slice(0, 400);
        if (cuerpo.includes('exigirAdministradorDePlataforma')) continue;
        const antes = texto.slice(0, texto.indexOf('@Get' + b.slice(0, 20)));
        if (!antes.trimEnd().endsWith('@SkipPermisos()')) {
          sinSkip.push(`${archivo}: @Get${b.slice(0, 20).split('\n')[0]}`);
        }
      }
    }
    expect(sinSkip).toEqual([]);
  });

  it('quien solicita una adjudicacion no la resuelve, ni aprobando ni rechazando', () => {
    /*
     * La regla estaba escrita a mano dentro de aprobar() y NO estaba en
     * rechazar(). El mismo comprador que pedia la adjudicacion podia tumbarla
     * antes de que otro la viera. Rechazar no es menos grave que aprobar: las
     * dos cierran el ciclo y las dos quedan en la pista de auditoria.
     *
     * La regla vive en el guardia comun; tenerla en dos lugares es como se
     * perdio la primera vez.
     */
    const servicio = leer(join(SRC, 'compras/services/cotizaciones.service.ts'));
    const guardia = servicio.slice(
      servicio.indexOf('private exigirFacultadDeResolver'),
    );
    expect(guardia.slice(0, 900)).toContain('solicitanteId === usuarioId');

    for (const metodo of ['async aprobar(', 'async rechazar(']) {
      const inicio = servicio.indexOf(metodo);
      expect(inicio).toBeGreaterThan(0);
      const cuerpo = servicio.slice(inicio, inicio + 1200);
      expect(cuerpo).toMatch(
        /exigirFacultadDeResolver\([^)]*solicitadoAprobacionPorId/s,
      );
    }
  });

  it('el comprador no da por recibida la mercancia que el mismo ordena', () => {
    /*
     * Comprar, autorizar y pagar ya estaban separados. Faltaba recibir, que es
     * el fraude de compras mas sencillo que existe: ordenar de mas, declararlo
     * recibido y que nadie cuente la caja. En SUMA recibe el almacenista.
     */
    const comprador = PLANTILLAS_PERMISOS.find((p) => p.rol === 'comprador');
    expect(comprador?.accionesVedadas).toContain(
      'PATCH /compras/ordenes/:id/recibir',
    );
    // Pero conserva la CONSULTA: necesita saber que llego para dar seguimiento.
    expect(comprador?.accionesVedadas ?? []).not.toContain(
      'GET /compras/ordenes/recepciones',
    );
  });
});

describe('Coherencia · un boton que lleva a un 403 es peor que no tenerlo', () => {
  const CENTRO = FRONTEND
    ? join(FRONTEND, 'app/dashboard/centros/[modulo]/page.tsx')
    : null;

  it('el centro de trabajo respeta la accion declarada de cada boton', () => {
    /*
     * `ModuleAction.accion` declara la accion de servidor que dispara cada
     * boton, y existe justamente para no ofrecer el camino a una negativa.
     * Estaba declarado, documentado... y ningun componente lo leia: el filtro
     * miraba solo la ruta de pantalla. Un campo muerto es peor que no tenerlo,
     * porque hace creer que el control existe.
     */
    if (!CENTRO || !existsSync(CENTRO)) return;
    const texto = leer(CENTRO);
    expect(texto).toContain('a.accion');
    expect(texto).toMatch(/tienePermiso\(\s*a\.accion\.metodo,\s*a\.accion\.ruta\s*\)/);
  });

  it('toda accion declarada en el menu apunta a un endpoint real', () => {
    if (!FRONTEND) return;
    const config = leer(join(FRONTEND, 'app/dashboard/module-config.ts'));
    const rutas = rutasDelBackend();
    const huerfanas: string[] = [];
    const re = /accion:\s*\{\s*metodo:\s*"(\w+)",\s*ruta:\s*"([^"]+)"\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(config))) {
      const clave = `${m[1]} ${m[2].replace(/^\/api/, '')}`;
      if (!rutas.has(clave)) huerfanas.push(clave);
    }
    expect(huerfanas).toEqual([]);
  });
});

describe('Coherencia · un modulo nombrado existe, o no es un modulo', () => {
  /*
   * ==========================================================================
   * El defecto que hizo falta para escribir esto
   * --------------------------------------------------------------------------
   * «Almacenes» existia como agrupacion en el menu del frontend y como
   * etiqueta en el mapa navegable, pero NO en `modulos-catalogo.ts`, que es el
   * unico lugar donde un modulo significa algo para los permisos. Las rutas
   * del WMS caian por prefijo en «Inventario», asi que conceder inventario en
   * consulta —al comprador, al vendedor, a hoteleria— entregaba el almacen
   * completo: 14 lecturas donde correspondian 4.
   *
   * Y lo silencioso: `modulosVedados: ['almacenes']` no habria hecho NADA,
   * porque el techo recorre modulos de ese catalogo. Una veda que no veda es
   * peor que ninguna, porque se confia en ella y nadie la vuelve a mirar.
   *
   * Nada fallaba. Ni el compilador, ni una prueba, ni la pantalla. Por eso
   * estas tres comprobaciones existen: un nombre de modulo que no existe tiene
   * que romper algo, y tiene que romperlo aqui.
   * ==========================================================================
   */

  it('todo modulo nombrado en una plantilla existe en el catalogo', () => {
    const validos = new Set(MODULOS_ASIGNABLES);
    const inventados: string[] = [];
    for (const p of PLANTILLAS_PERMISOS) {
      for (const [campo, lista] of [
        ['modulos', p.modulos],
        ['modulosConsulta', p.modulosConsulta ?? []],
        ['modulosVedados', p.modulosVedados ?? []],
      ] as const) {
        for (const m of lista) {
          if (!validos.has(m)) inventados.push(`${p.rol}.${campo}: "${m}"`);
        }
      }
    }
    expect(inventados).toEqual([]);
  });

  it('todo modulo del menu del frontend existe como modulo de permisos', () => {
    /*
     * El menu agrupa pantallas; los permisos agrupan rutas. Son dos preguntas
     * distintas y pueden agrupar distinto —«Reportes» junta pantallas de
     * ventas, caja y credito, y eso es correcto—. Lo que NO puede pasar es que
     * el menu presente como modulo algo que no se puede conceder ni vedar:
     * el usuario lo ve como una unidad y la administracion no puede tratarlo
     * como tal.
     *
     * Los contenedores declarados quedan fuera: no son modulos, son cajones.
     */
    if (!FRONTEND) return;
    const config = leer(join(FRONTEND, 'app/dashboard/module-config.ts'));

    /*
     * Cada cajon del menu, con lo que declara junto a su `id`: el bloque va
     * desde su `id:` hasta el `id:` siguiente.
     */
    const marcas = [...config.matchAll(/^\s{4}id:\s*"([^"]+)",/gm)];
    expect(marcas.length).toBeGreaterThan(5); // si el regex deja de casar, que se note

    const validos = new Set(MODULOS_ASIGNABLES);
    const sinDeclarar: string[] = [];
    const mapeoInvalido: string[] = [];

    for (let i = 0; i < marcas.length; i += 1) {
      const id = marcas[i][1];
      const desde = marcas[i].index ?? 0;
      const hasta = i + 1 < marcas.length ? (marcas[i + 1].index ?? config.length) : config.length;
      const bloque = config.slice(desde, hasta);

      const mapea = /moduloPermisos:\s*"([^"]+)"/.exec(bloque);
      const agrupa = /agrupacion:\s*true/.test(bloque);

      if (mapea) {
        if (!validos.has(mapea[1])) mapeoInvalido.push(`${id} → "${mapea[1]}"`);
        continue;
      }
      if (agrupa) continue;
      if (validos.has(id)) continue;
      sinDeclarar.push(id);
    }

    // Un cajon que no es un modulo tiene que DECIRLO, no parecerse a uno.
    expect(sinDeclarar).toEqual([]);
    // Y si dice a que modulo corresponde, ese modulo tiene que existir.
    expect(mapeoInvalido).toEqual([]);
  });

  it('el mapa navegable no vuelve a guardar de que modulo es una ruta', () => {
    /*
     * `EndpointNavMeta` tenia un campo `modulo: string` que nadie leia y que
     * contradecia a `moduloDeRuta()` en 29 de 115 entradas. Un dato duplicado
     * que nadie consulta solo puede divergir, y este divergio hasta inventar
     * modulos que no existian.
     *
     * De que modulo es una ruta lo responde `moduloDeRuta()`. Punto.
     */
    const mapa = leer(join(SRC, 'iam/data/endpoints-navegables.ts'));
    expect(sinComentarios(mapa)).not.toMatch(/^\s*modulo:/m);
  });

  it('cada modulo del catalogo se queda con las rutas que le tocan', () => {
    /*
     * Almacen y Inventario se separaron el 21-sep-2026. Esta prueba fija la
     * frontera: si alguien devuelve `/catalogo/wms` a Inventario, el comprador
     * y el vendedor vuelven a tener el almacen completo sin que nada lo diga.
     */
    expect(moduloDeRuta('/catalogo/wms/conteos')).toBe('almacenes');
    expect(moduloDeRuta('/catalogo/wms/ubicaciones')).toBe('almacenes');
    expect(moduloDeRuta('/catalogo/almacenes')).toBe('almacenes');
    expect(moduloDeRuta('/compras/ordenes/:id/recibir')).toBe('almacenes');
    expect(moduloDeRuta('/compras/ordenes/recepciones')).toBe('almacenes');

    expect(moduloDeRuta('/catalogo/productos')).toBe('inventario');
    expect(moduloDeRuta('/catalogo/inventario/stock')).toBe('inventario');

    // Y el almacen es concedible y vedable de verdad, no una etiqueta.
    expect(MODULOS_POR_ID.has('almacenes')).toBe(true);
    expect(MODULOS_ASIGNABLES).toContain('almacenes');
  });

  it('quien hace el trabajo de almacen tiene el modulo de almacen', () => {
    const almacenista = PLANTILLAS_PERMISOS.find((p) => p.rol === 'almacenista');
    expect(almacenista?.modulos).toContain('almacenes');

    // Y quien solo necesita saber que hay en existencia, no.
    for (const rol of ['comprador', 'empleado', 'hoteleria']) {
      const p = PLANTILLAS_PERMISOS.find((x) => x.rol === rol);
      if (!p) continue;
      expect([...p.modulos, ...(p.modulosConsulta ?? [])]).not.toContain('almacenes');
    }
  });
});

describe('Coherencia · el acomodo dirigido no deja a nadie sin salida', () => {
  /*
   * ==========================================================================
   * La pantalla de recepcion exige ubicacion en cada partida y el servidor
   * exige que el producto YA sea de esa ubicacion. Las dos reglas por separado
   * tienen sentido; juntas hacian que la PRIMERA recepcion de cualquier
   * producto nuevo terminara en 400 y mandara al almacenista a otra pantalla
   * con la caja en la mano. Verificado el 21-sep-2026 corriendo el ciclo
   * completo contra la base real.
   *
   * La salida elegida fue resolverlo en la misma pantalla. Eso solo se
   * sostiene si quien recibe puede asignar, asi que esa es la prueba.
   * ==========================================================================
   */

  it('quien recibe mercancia puede darle casa al producto', () => {
    const almacenista = PLANTILLAS_PERMISOS.find((p) => p.rol === 'almacenista');
    expect(almacenista?.modulos).toContain('almacenes');
    expect(almacenista?.accionesVedadas ?? []).not.toContain(
      'POST /catalogo/wms/productos/:id/ubicaciones',
    );
    expect(moduloDeRuta('/catalogo/wms/productos/:id/ubicaciones')).toBe('almacenes');
  });

  it('la recepcion comprueba el acomodo antes de mandar, no despues del 400', () => {
    if (!FRONTEND) return;
    const pantalla = leer(
      join(FRONTEND, 'app/dashboard/inventario/recepciones/[id]/page.tsx'),
    );
    // Sabe donde tiene casa cada producto…
    expect(pantalla).toContain('tieneCasaEn');
    // …lo valida antes de enviar…
    expect(pantalla).toMatch(/sinCasa[\s\S]{0,400}return setToast/);
    // …y ofrece resolverlo sin salir.
    expect(pantalla).toContain('asignarAqui');
    expect(pantalla).toContain('/catalogo/wms/productos/:id/ubicaciones');
  });
});

describe('Coherencia · las tres reglas de gobierno de compras', () => {
  /*
   * ==========================================================================
   * Implementadas como las resuelven los ERP grandes, 21-sep-2026.
   * Cada una nacio de un hallazgo de la corrida del ciclo completo.
   * ==========================================================================
   */
  const requisiciones = leer(join(SRC, 'compras/services/requisiciones.service.ts'));

  it('el umbral por monto se aplica, y valua con el costo de reposicion', () => {
    /*
     * `montoDesde`/`montoHasta` existian en la entidad y no los usaba nadie:
     * TODA requisicion subia al mando. Una requisicion no trae precios, asi que
     * se valua con `precioCompra` —el costo que la recepcion mantiene al dia—,
     * que es lo que hace SAP B1 con su «Last Purchase Price».
     */
    expect(requisiciones).toContain('importeEstimado');
    expect(requisiciones).toMatch(/montoDesde[\s\S]{0,400}montoHasta/);
    expect(requisiciones).toContain('precioCompra');
    // Y por debajo del umbral la requisicion nace lista para cotizar.
    expect(requisiciones).toMatch(/requiereAutorizacion \? 'PENDIENTE' : 'COTIZANDO'/);
  });

  it('la ruta no se rompe porque una persona deje la empresa', () => {
    /*
     * Antes la ruta EXIGIA usuarioId en cada nivel y rechazaba la requisicion
     * entera si alguno estaba inactivo: dar de baja al aprobador no dejaba
     * documentos trabados, detenia al area completa. Business Central lo
     * resuelve con Approver → Substitute → administrador de aprobaciones.
     */
    expect(requisiciones).toContain('resolverFirmante');
    expect(sinComentarios(requisiciones)).not.toContain(
      'La ruta contiene aprobadores inactivos',
    );
    expect(sinComentarios(requisiciones)).not.toContain(
      'La ruta de aprobación contiene niveles sin un aprobador asignado',
    );
    /*
     * La cadena vive ahora en `rutas-aprobacion.util` y la usan LAS DOS rutas
     * de compras. Estaba anidada dentro de requisiciones, y la adjudicacion de
     * cotizaciones copiaba el `usuarioId` de la ruta tal cual: por eso alli no
     * servian las rutas por rol —que son las que separan a quien adjudica de
     * quien contabiliza— y una baja dejaba la adjudicacion trabada.
     */
    const util = leer(join(SRC, 'compras/utils/rutas-aprobacion.util.ts'));
    const cotizaciones = leer(join(SRC, 'compras/services/cotizaciones.service.ts'));
    expect(util).toContain('export function resolverFirmante');
    expect(util).toContain('rolAprobador');
    expect(util).toContain('esRolAdministrador');
    expect(util).toContain('noEsElSolicitante');
    expect(cotizaciones).toContain('resolverFirmante');

    /*
     * El escalon del suplente busca el rol que TENIA la persona dada de baja.
     * Con una lista de solo activos no la encontraba nunca y era codigo
     * muerto: por eso las dos rutas pasan el padron completo.
     */
    expect(sinComentarios(requisiciones)).toContain(
      'this.usuarioRepo.find({ where: { empresaId } })',
    );
    expect(sinComentarios(util)).not.toMatch(
      /const activos = padron;/,
    );
  });

  it('lo que mueve existencias exige categoria, y el servicio no', () => {
    /*
     * De la categoria cuelgan las cuentas del producto. Sin ella la recepcion
     * entra y la poliza se encola para siempre. SAP B1 exige grupo de
     * articulos; Business Central exige Inventory Posting Group para registrar.
     */
    const productos = leer(join(SRC, 'catalogo/services/productos.service.ts'));
    expect(productos).toContain('TIPOS_CON_INVENTARIO');
    expect(productos).toMatch(/FISICO[\s\S]{0,80}CONSUMIBLE[\s\S]{0,80}MATERIA_PRIMA/);
    // El servicio no lleva inventario: la regla no lo toca.
    expect(productos).not.toMatch(/TIPOS_CON_INVENTARIO\s*=\s*\[[^\]]*SERVICIO/);

    // Y el arranque deja el catalogo en condiciones de cumplirla.
    const arranque = leer(join(SRC, 'catalogo/services/catalogos-iniciales.service.ts'));
    expect(arranque).toContain('asegurarCategoriaPorDefecto');
    expect(arranque).toContain('acomodarProductosSinCategoria');
    expect(arranque).toContain('asegurarCuentasDeCategorias');
  });
});

describe('Coherencia · las dos autorizaciones no pueden contradecirse', () => {
  const SERVICIO = join(SRC, 'iam/services/permisos-dinamicos.service.ts');
  const GUARDIA = join(SRC, 'common/guards/roles.guard.ts');

  /*
   * En este sistema autorizan dos cosas y las dos tienen que decir que sí: la
   * tabla de permisos por módulo y el `@Roles(...)` del controlador. Son
   * preguntas distintas y por eso conviven.
   *
   * Lo que no puede existir es una fila concedida sobre un endpoint que el
   * guardia de roles veta. Esa fila no abre nada: sólo sale en
   * `GET /auth/mis-permisos`, que es de donde el frontend saca qué pintar. El
   * resultado es un menú que ofrece una pantalla que contesta 403 al abrirse
   * —le pasó entero a `credito` con el módulo `integracion`—, y detrás de eso
   * una línea de crédito que sólo él podía aprobar exigiendo un expediente que
   * sólo él no podía producir.
   */
  it('el contrato recoge lo que cada endpoint exige por @Roles', () => {
    const texto = leer(SERVICIO);
    expect(texto).toContain('ROLES_KEY');
    expect(texto).toMatch(/rolesEstaticosPorRuta\.set\(/);
  });

  it('el piso de un rol no incluye lo que el guardia de roles le veta', () => {
    const texto = sinComentarios(leer(SERVICIO));
    expect(texto).toMatch(
      /vetadosPorGuardiaDeRoles\(rol\)\)\s*piso\.delete\(id\)/,
    );
  });

  it('la sincronización apaga las filas concedidas de más', () => {
    const texto = sinComentarios(leer(SERVICIO));
    expect(texto).toContain('await this.apagarPermisosQueElGuardiaDeRolesVeta();');
  });

  /*
   * El administrador no pasa por la tabla de permisos, así que apagarle filas
   * no significaría nada y borrar las suyas sería un cambio real de alcance.
   */
  it('la limpieza deja fuera al administrador', () => {
    const texto = leer(SERVICIO);
    const metodo = texto.slice(
      texto.indexOf('private async apagarPermisosQueElGuardiaDeRolesVeta'),
    );
    expect(metodo.slice(0, 2000)).toContain('esRolAdministrador');
  });

  it('el guardia sigue comparando con normalizarRol, no por igualdad de cadenas', () => {
    const texto = leer(GUARDIA);
    expect(texto).toMatch(/exigidos\.map\(normalizarRol\)/);
  });
});

describe('Coherencia · quien debe aprobar puede producir lo que se le exige', () => {
  const CONTROLADOR = join(
    SRC,
    'integracion/validacion/validacion.controller.ts',
  );
  const SERVICIO_APROBACIONES = join(
    SRC,
    'aprobaciones/services/aprobaciones-documentos.service.ts',
  );

  /*
   * La puerta que autoriza una línea exige un expediente de validación que
   * cubra el importe. La matriz manda esas solicitudes al rol `credito`. Si
   * `credito` no puede correr la verificación, el requisito es imposible de
   * cumplir para la única persona a la que se le pide: la línea de María
   * Fernanda Robles se quedó tres días parada y reventó su SLA por esto, con
   * un 409 que sólo aparecía después de pulsar «Aprobar».
   */
  it('credito puede ejecutar el flujo de validación', () => {
    const texto = leer(CONTROLADOR);
    const i = texto.indexOf("@Post('ejecutar')");
    expect(i).toBeGreaterThan(-1);
    expect(texto.slice(i, i + 200)).toContain("'credito'");
  });

  it('simular sigue fuera de su alcance', () => {
    const texto = leer(CONTROLADOR);
    const i = texto.indexOf("@Post('simular')");
    expect(i).toBeGreaterThan(-1);
    expect(texto.slice(i, i + 200)).not.toContain("'credito'");
  });

  it('el contrato le concede la acción, no el módulo entero', () => {
    const plantilla = PLANTILLAS_PERMISOS.find((p) => p.rol === 'credito');
    expect(plantilla?.accionesIrrenunciables ?? []).toContain(
      'POST /integracion/validacion/ejecutar',
    );
    expect(plantilla?.modulos ?? []).not.toContain('integracion');
  });

  /*
   * La pantalla es el control de verificaciones, no el diseñador del flujo.
   * Colgarla de `flujos` —administración pura— se la ofrecía a quien no la
   * usa y se la negaba a quien sí.
   */
  it('la pantalla de verificación cuelga del tablero, no del diseño del flujo', () => {
    expect(
      ENDPOINTS_NAVEGABLES['GET /integracion/validacion/tablero']?.rutaFrontend,
    ).toBe('/dashboard/creditos/verificacion');
    expect(
      ENDPOINTS_NAVEGABLES['GET /integracion/validacion/flujos'],
    ).toBeUndefined();
  });

  /*
   * Y la bandeja tiene que poder decirlo ANTES del clic: una sola cuenta
   * decide lo que se pinta y lo que la puerta deja pasar.
   */
  it('la tarjeta apaga Aprobar y deja Rechazar cuando el expediente no cubre', () => {
    /*
     * Rechazar tiene que seguir encendido a propósito: una línea sin respaldo
     * se puede devolver ahora mismo, y la puerta sólo mira el expediente
     * cuando se aprueba. Apagar los dos botones dejaría el documento inmóvil,
     * que es justo de donde venimos.
     */
    if (!FRONTEND) return;
    const texto = leer(join(FRONTEND, 'app/dashboard/aprobaciones/page.tsx'));
    expect(texto).toContain('bloqueaValidacion');
    const aprobar = texto.slice(texto.indexOf('resolver(item, "APROBADA")') - 400);
    expect(aprobar.slice(0, 400)).toContain('bloqueaValidacion');
    const rechazar = texto.slice(
      texto.indexOf('resolver(item, "RECHAZADA")') - 400,
      texto.indexOf('resolver(item, "RECHAZADA")'),
    );
    expect(rechazar).not.toContain('bloqueaValidacion');
  });

  it('la bandeja publica el veredicto de la puerta', () => {
    const texto = leer(SERVICIO_APROBACIONES);
    expect(texto).toContain('validacion: veredictos.get(aprobacion.id) ?? null');
    const puerta = texto.slice(
      texto.indexOf('private async exigirValidacionFavorable'),
    );
    expect(puerta.slice(0, 600)).toContain('this.evaluarValidacion(');
  });
});

describe('Coherencia · quien aprueba no escribe la regla que lo obliga', () => {
  const APROBADORES = [
    'finanzas',
    'tesoreria',
    'credito',
    'hoteleria',
    'rrhh',
    'gerencia',
    'direccion',
  ];
  const plantilla = (rol: string) =>
    PLANTILLAS_PERMISOS.find((p) => p.rol === rol);

  /*
   * Hasta el 21-sep-2026 el módulo `aprobaciones` llevaba los dos prefijos:
   * la bandeja y la matriz. Quien recibía la bandeja para trabajar recibía de
   * propina la potestad de reescribir la regla que decide quién firma —es
   * decir, de borrar el renglón que exige su propia firma—. Y no era un rol
   * suelto: lo tenían los siete que aprueban algo.
   */
  it('la bandeja y la matriz son módulos distintos', () => {
    const bandeja = MODULOS_NEGOCIO.find((m) => m.id === 'aprobaciones');
    const matriz = MODULOS_NEGOCIO.find((m) => m.id === 'gobierno-aprobaciones');

    expect(bandeja?.prefijos).toEqual(['/aprobaciones']);
    expect(matriz?.prefijos).toEqual(['/configuraciones-aprobacion']);
    expect(matriz?.sensible).toBe(true);
  });

  it('ningún rol que aprueba puede escribir la matriz', () => {
    const infractores = APROBADORES.filter((rol) =>
      (plantilla(rol)?.modulos ?? []).includes('gobierno-aprobaciones'),
    );
    expect(infractores).toEqual([]);
  });

  /*
   * Pero sí tienen que poder LEERLA. Un documento que llega sin que se pueda
   * averiguar por qué llega —o con qué plazo— es la mitad del problema del
   * que venimos: el expediente de María Fernanda estuvo tres días parado
   * porque nadie podía ver la regla que lo enrutaba.
   */
  it('todos los que aprueban conservan la lectura de la matriz', () => {
    const ciegos = APROBADORES.filter(
      (rol) =>
        !(plantilla(rol)?.modulosConsulta ?? []).includes(
          'gobierno-aprobaciones',
        ),
    );
    expect(ciegos).toEqual([]);
  });

  it('el gobierno de la matriz lo tiene exactamente un rol', () => {
    const duenos = PLANTILLAS_PERMISOS.filter((p) =>
      (p.modulos ?? []).includes('gobierno-aprobaciones'),
    ).map((p) => p.rol);
    expect(duenos).toEqual(['gobierno']);
  });

  /*
   * Lo que define al rol. Si este renglón desaparece deja de ser un control y
   * pasa a ser un aprobador más con poder para reescribir las reglas: el peor
   * de los dos mundos.
   */
  it('el rol de gobierno tiene vedado resolver documentos', () => {
    expect(plantilla('gobierno')?.accionesVedadas ?? []).toContain(
      'PATCH /aprobaciones/:id/resolver',
    );
    expect(plantilla('gobierno')?.modulos ?? []).not.toContain('aprobaciones');
  });

  /*
   * Lee usuarios y departamentos por ACCIÓN, no por módulo: necesita los dos
   * para clavar aprobadores, y ninguno de los dos enteros —en uno vive la
   * nómina y en el otro los permisos—.
   */
  it('lo que necesita de otros módulos lo toma por acción', () => {
    const acciones = plantilla('gobierno')?.accionesIrrenunciables ?? [];
    expect(acciones).toContain('GET /departamentos');
    expect(acciones).toContain('GET /usuarios');
    const modulos = plantilla('gobierno')?.modulos ?? [];
    expect(modulos).not.toContain('rrhh');
    expect(modulos).not.toContain('administracion');
  });

  /*
   * El invariante que hace segura la vista completa del historial: quien ve
   * todo no puede firmar nada. Ver expedientes crediticios ajenos —nombre,
   * RFC, límite, nivel de riesgo— sólo se justifica desde una posición que no
   * pueda actuar sobre ellos.
   */
  it('quien ve la traza completa no puede resolver', () => {
    for (const rol of ROLES_CON_TRAZA_COMPLETA) {
      const p = plantilla(rol);
      expect(p).toBeDefined();
      expect(p?.accionesVedadas ?? []).toContain(
        'PATCH /aprobaciones/:id/resolver',
      );
      expect(p?.modulos ?? []).not.toContain('aprobaciones');
    }
  });

  /*
   * Las filas viejas no se apagan solas: el contrato sólo enciende. Y saltarse
   * un rol entero por tener el módulo en consulta dejaría intacto justo lo que
   * se quería cerrar —POST y DELETE sobre la matriz—, porque los siete
   * conservan la lectura.
   */
  it('la separación retira lo escrito antes, respetando la consulta', () => {
    const texto = leer(join(SRC, 'iam/services/permisos-dinamicos.service.ts'));
    const lista = texto.slice(
      texto.indexOf('MODULOS_RECIEN_SEPARADOS = ['),
      texto.indexOf('MODULOS_RECIEN_SEPARADOS = [') + 200,
    );
    expect(lista).toContain("'gobierno-aprobaciones'");
    const sinComentar = sinComentarios(texto);
    expect(sinComentar).toContain('const soloLectura = (plantilla.modulosConsulta');
    expect(sinComentar).toContain('if (soloLectura && this.esConsulta(ep)) continue;');
  });

  /*
   * Y la pantalla tiene que preguntarlo. Ahora la ven dos públicos: quien la
   * gobierna y los siete que sólo la consultan. Sin guarda, a estos últimos
   * les pinta «Guardar flujo» y el servidor contesta 403 al pulsar, que es
   * exactamente el patrón que se cerró en crédito.
   */
  /*
   * La cuarta lista de roles. El catálogo del backend dice que «quien agregue
   * un rol nuevo agrega su plantilla y aparece solo»; la pantalla de la matriz
   * tenía la suya, fija, de diez, ampliada con los roles que YA tuviera algún
   * usuario. Eso deja fuera exactamente el caso que hay que poder configurar:
   * un rol recién creado, al que todavía no pertenece nadie. Le pasó a
   * `gobierno` el día que nació.
   */
  it('la pantalla de la matriz no tiene su propia lista de roles', () => {
    if (!FRONTEND) return;
    const texto = sinComentarios(
      leer(join(FRONTEND, 'app/dashboard/configuraciones-aprobacion/page.tsx')),
    );
    expect(texto).not.toContain('rolesBase');
    expect(texto).toContain('/configuraciones-aprobacion/catalogo/roles');
  });

  it('el catálogo de roles lo sirve el contrato, no una lista escrita a mano', () => {
    const servicio = leer(
      join(SRC, 'compras/services/configuraciones-aprobacion.service.ts'),
    );
    expect(servicio).toContain('catalogoRoles()');
    expect(servicio).toContain('PLANTILLAS_PERMISOS.map');
  });

  it('la pantalla de la matriz esconde la escritura a quien sólo consulta', () => {
    if (!FRONTEND) return;
    const texto = leer(
      join(FRONTEND, 'app/dashboard/configuraciones-aprobacion/page.tsx'),
    );
    expect(texto).toMatch(
      /tienePermiso\(\s*"POST",\s*"\/configuraciones-aprobacion"\s*\)/,
    );
    const guardar = texto.slice(
      texto.indexOf('Guardar flujo') - 400,
      texto.indexOf('Guardar flujo'),
    );
    expect(guardar).toContain('puedeGobernar');
  });
});
