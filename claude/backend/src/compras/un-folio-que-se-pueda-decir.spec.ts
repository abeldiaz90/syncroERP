/**
 * ============================================================================
 * Un folio que se pueda decir
 * ----------------------------------------------------------------------------
 * Los cinco documentos de compras —requisición, cotización, orden de compra,
 * recepción y pago a proveedor— **no tenían folio**. Lo que la pantalla
 * llamaba «OC-4F3A9C21» se calculaba al vuelo recortando los primeros ocho
 * caracteres del uuid, en once pantallas y una docena de lugares del servidor,
 * cada uno por su cuenta y sin que nada lo guardara.
 *
 * Tres consecuencias, en orden de peso:
 *
 *   1. **No es único.** Ocho caracteres hexadecimales son 32 bits. Por la
 *      paradoja del cumpleaños, a los ~10,000 documentos ya hay cerca de 1% de
 *      probabilidad de que dos distintos muestren el mismo «folio», y a los
 *      ~77,000 es del 50%. La póliza de una recepción referencia su orden por
 *      ese recorte: dos órdenes con el mismo nombre en el rastro contable es
 *      un asiento que no se puede amarrar a su origen.
 *   2. No se puede dictar ni anotar en una factura, que es para lo único que
 *      existe un folio: para que dos personas que no están frente a la misma
 *      pantalla hablen del mismo documento.
 *   3. No se puede auditar. «¿Cuántas órdenes van este año?» no tiene respuesta
 *      cuando los folios son aleatorios.
 *
 * Formato decidido por Abel el 1-oct-2026: `OC-2026-000001`, con el
 * consecutivo reiniciando cada ejercicio, y renumerando los documentos
 * existentes por fecha de creación.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  PATRON_DE_FOLIO,
  TIPOS_DE_FOLIO,
  folioDe,
  formatearFolio,
} from '../common/services/folios.service';

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const fuente = (...ruta: string[]) =>
  readFileSync(join(SRC, ...ruta), 'utf8');
/*
 * Para las pruebas en negativo. Sin esto medirían los comentarios: este mismo
 * archivo y los servicios explican el defecto citando `MAX(`, `getFullYear()`
 * y el recorte de uuid, y una prueba que se cae por la prosa que la explica no
 * vigila el código.
 */
const sinComentarios = (t: string) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const pantalla = (relativa: string) =>
  FRONTEND && existsSync(join(FRONTEND, relativa))
    ? readFileSync(join(FRONTEND, relativa), 'utf8')
    : '';

describe('La forma del folio', () => {
  it('es prefijo, ejercicio y seis dígitos', () => {
    expect(formatearFolio('OC', 2026, 1)).toBe('OC-2026-000001');
    expect(formatearFolio('REQ', 2026, 1234)).toBe('REQ-2026-001234');
  });

  it('seis dígitos no se recortan al pasarse', () => {
    /*
     * `padStart` no trunca, y es lo correcto: un millón de documentos en un año
     * es improbable, pero un folio recortado a seis dígitos empezaría a
     * repetirse y el índice único rechazaría el alta. Que crezca es feo; que
     * colisione es el defecto que venimos a quitar.
     */
    expect(formatearFolio('OC', 2026, 1234567)).toBe('OC-2026-1234567');
  });

  it('el patrón reconoce lo que la función produce', () => {
    for (const tipo of Object.values(TIPOS_DE_FOLIO)) {
      expect(formatearFolio(tipo, 2026, 7)).toMatch(PATRON_DE_FOLIO);
    }
  });

  it('y no reconoce el recorte de uuid de antes', () => {
    expect('OC-4F3A9C21').not.toMatch(PATRON_DE_FOLIO);
  });
});

describe('Lo que se enseña es el folio guardado', () => {
  it('se prefiere el folio del documento', () => {
    expect(
      folioDe({ folio: 'OC-2026-000042', id: 'aaaaaaaa-bbbb' }, 'OC'),
    ).toBe('OC-2026-000042');
  });

  it('sin folio se cae al recorte, para no dejar la pantalla en blanco', () => {
    /*
     * El respaldo es temporal y tiene una razón concreta: una instalación
     * puede actualizar el código antes de correr la migración. Cambiar un
     * folio malo por ninguno no sería un arreglo.
     */
    expect(folioDe({ id: '4f3a9c21-1111-2222-3333-444444444444' }, 'OC')).toBe(
      'OC-4F3A9C21',
    );
  });

  it('un folio en blanco cuenta como ausente, no como folio', () => {
    /*
     * `''` y `'   '` son lo que deja una columna rellenada a medias. Sin este
     * cuidado la pantalla enseñaría «OC-» y nada más.
     */
    expect(folioDe({ folio: '   ', id: '4f3a9c21-aa' }, 'OC')).toBe(
      'OC-4F3A9C21',
    );
  });

  it('y sin documento no se inventa un número', () => {
    expect(folioDe(null, 'OC')).toBe('OC-?');
  });
});

describe('El consecutivo se entrega sin carreras', () => {
  const servicio = fuente('common', 'services', 'folios.service.ts');

  it('es una sola sentencia atómica, no leer-y-escribir', () => {
    /*
     * Un `SELECT MAX(...) + 1` —que es lo que hacen los cuatro generadores que
     * ya existían en el ERP— tiene una ventana entre leer y escribir: dos
     * altas simultáneas se llevan el mismo folio. No se nota en pruebas,
     * porque hace falta que dos personas guarden en el mismo instante, y se
     * nota el día que una sucursal entera captura a la vez.
     */
    expect(servicio).toMatch(/INSERT INTO folio_secuencias/);
    expect(servicio).toMatch(/ON CONFLICT \(empresaid, tipo, anio\)/);
    expect(servicio).toMatch(/DO UPDATE SET ultimo = folio_secuencias\.ultimo \+ 1/);
    expect(servicio).toMatch(/RETURNING ultimo/);
    expect(sinComentarios(servicio)).not.toMatch(/MAX\(/);
  });

  it('el ejercicio se resuelve en la zona del negocio', () => {
    /*
     * Con `getFullYear()` sobre un proceso en UTC, un documento guardado a las
     * 19:00 del 31 de diciembre en México tomaría el folio del año siguiente.
     * Es el mismo defecto que ya nos costó una corrección en las fechas de las
     * pólizas, entrando por el folio.
     */
    expect(servicio).toMatch(/fechaCalendarioNegocio\(instante\)/);
    expect(sinComentarios(servicio)).not.toMatch(/getFullYear\(\)/);
  });

  it('recibe el manager de la transacción del documento', () => {
    /*
     * Para que el número se DEVUELVA si el alta falla. Una secuencia de
     * Postgres no haría eso: `nextval` dentro de una transacción que se
     * revierte consume el número igual y deja un hueco, y un hueco en el
     * consecutivo es lo primero que pregunta un auditor.
     */
    expect(servicio).toMatch(/manager: EntityManager,/);
    expect(servicio).toMatch(/manager\.query\(/);
    expect(sinComentarios(servicio)).not.toMatch(/this\.dataSource\.transaction/);
  });

  it('un consecutivo que no es un entero no se convierte en folio', () => {
    expect(servicio).toMatch(/Number\.isInteger\(consecutivo\)/);
    expect(servicio).toMatch(/consecutivo < 1/);
    expect(servicio).toMatch(/throw new Error\(/);
  });
});

describe('Los cinco documentos lo guardan', () => {
  const ENTIDADES = [
    'requisicion',
    'cotizacion',
    'orden-compra',
    'recepcion-compra',
    'pago-proveedor',
  ];

  it('cada uno tiene su columna', () => {
    for (const nombre of ENTIDADES) {
      const entidad = fuente('compras', 'entities', `${nombre}.entity.ts`);
      expect([nombre, /folio\?: string;/.test(entidad)]).toEqual([
        nombre,
        true,
      ]);
    }
  });

  it('y su índice único por empresa, parcial', () => {
    /*
     * Único porque dos documentos con el mismo folio es justamente lo que se
     * viene a impedir, y la base es el único lugar donde eso se puede
     * garantizar. Parcial porque una instalación a medio rellenar tiene nulos,
     * y en Postgres `NULL` no colisiona con nada.
     */
    for (const nombre of ENTIDADES) {
      const entidad = fuente('compras', 'entities', `${nombre}.entity.ts`);
      expect([
        nombre,
        entidad.includes(
          "@Index(['empresaId', 'folio'], { unique: true, where: 'folio IS NOT NULL' })",
        ),
      ]).toEqual([nombre, true]);
    }
  });
});

describe('Y lo reservan al nacer', () => {
  it('la requisición', () => {
    const s = fuente('compras', 'services', 'requisiciones.service.ts');
    expect(s).toMatch(/TIPOS_DE_FOLIO\.REQUISICION,\s*empresaId,\s*em,/);
  });

  it('la cotización, que para esto pasó a una transacción', () => {
    /*
     * El alta guardaba la cotización y sus partidas en dos escrituras sueltas.
     * Hacía falta una transacción para el folio, y de paso cerró un agujero
     * que ya estaba: un fallo en las partidas dejaba una cotización sin
     * renglones, con total pactado y nada que lo sustente.
     */
    const s = fuente('compras', 'services', 'cotizaciones.service.ts');
    expect(s).toMatch(/TIPOS_DE_FOLIO\.COTIZACION,/);
    expect(s).toMatch(/await this\.dataSource\.transaction\(async \(em\) => \{/);
    expect(sinComentarios(s)).not.toMatch(/await this\.cotizacionRepo\.save\(this\.cotizacionRepo\.create/);
  });

  it('la orden, la recepción y el pago', () => {
    const s = fuente('compras', 'services', 'ordenes-compra.service.ts');
    for (const tipo of ['ORDEN_COMPRA', 'RECEPCION', 'PAGO_PROVEEDOR']) {
      expect([tipo, s.includes(`TIPOS_DE_FOLIO.${tipo},`)]).toEqual([
        tipo,
        true,
      ]);
    }
  });

  it('siempre con el manager de la transacción en curso, nunca sin él', () => {
    /*
     * La prueba que impide el atajo. `this.folios.siguiente(tipo, empresaId)`
     * no compila —el manager es obligatorio—, pero sí compilaría pasarle un
     * manager recién abierto, y entonces el número no se devolvería al fallar.
     */
    const s = fuente('compras', 'services', 'ordenes-compra.service.ts');
    const llamadas = [...s.matchAll(/this\.folios\.siguiente\(([\s\S]*?)\)/g)];
    expect(llamadas.length).toBe(3);
    for (const [, argumentos] of llamadas) {
      expect(argumentos).toMatch(/qr\.manager|\bem\b/);
    }
  });
});

describe('Nadie vuelve a armar el folio a mano', () => {
  it('ni el servidor', () => {
    /*
     * La prueba en negativo, que es la que cierra el agujero: si alguien
     * vuelve a escribir `OC-` más un recorte de uuid en cualquier parte, el
     * folio del documento y el de esa pantalla dejan de coincidir y nada lo
     * delata.
     */
    for (const archivo of [
      join('compras', 'services', 'ordenes-compra.service.ts'),
      join('compras', 'services', 'devoluciones-proveedor.service.ts'),
      join('compras', 'utils', 'email-templates.ts'),
      join('notificaciones', 'email-templates.ts'),
      join('notificaciones', 'notificaciones.service.ts'),
    ]) {
      const texto = sinComentarios(fuente(archivo))
        /*
         * Se exceptúa la CLAVE DE IDEMPOTENCIA del asiento del pago
         * —`PAGO-OC-<ocho del uuid>`—, que no es un folio: es la llave con la
         * que el motor contable reconoce un reintento. Cambiarla haría que un
         * evento ya encolado dejara de reconocerse y se contabilizara dos
         * veces. Tiene el mismo problema de colisión que el folio y se dejó
         * anotado como pendiente aparte, porque migrarla exige mover la cola
         * de eventos pendientes y eso es una decisión, no un arreglo.
         */
        .replace(/`PAGO-OC-\$\{pago\.id[^`]*`/g, '');
      expect([archivo, /OC-\$\{/.test(texto)]).toEqual([archivo, false]);
      expect([archivo, /REQ-\$\{/.test(texto)]).toEqual([archivo, false]);
    }
  });

  it('ni las pantallas: NINGUNA, no una lista de ellas', () => {
    /*
     * ========================================================================
     * La primera versión de esta prueba recorría siete rutas escritas a mano.
     * Pasaba en verde mientras SIETE PANTALLAS MÁS seguían armando el folio
     * con un recorte del uuid, incluida la lista de requisiciones y su PDF
     * —que dice «Folio Oficial» sobre seis caracteres hexadecimales— y la
     * ficha de propuestas, donde Abel vio «Referencia: REQ-E0E02C9A» el
     * 30-sep-2026 mientras verificábamos este mismo arreglo.
     *
     * Una prueba que vigila una lista sólo vigila lo que alguien se acordó de
     * apuntar, y da exactamente la tranquilidad que impide buscar el resto.
     * Ahora recorre el frontend entero.
     * ========================================================================
     */
    if (!FRONTEND) return;

    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    const archivos: string[] = [];
    const caminar = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === '.next') continue;
        const completo = join(dir, nombre);
        if (statSync(completo).isDirectory()) caminar(completo);
        else if (/\.tsx?$/.test(completo)) archivos.push(completo);
      }
    };
    for (const carpeta of ['app', 'components', 'lib']) {
      const dir = join(FRONTEND, carpeta);
      if (existsSync(dir)) caminar(dir);
    }
    expect(archivos.length).toBeGreaterThan(50);

    const culpables: string[] = [];
    for (const archivo of archivos) {
      const texto = sinComentarios(readFileSync(archivo, 'utf8'));
      /* `OC-{algo}` en JSX: el folio armado a mano desde un identificador. */
      const malos = texto.match(/\b(OC|REQ|COT|REC|PP)-\{/g);
      if (malos) culpables.push(`${archivo.replace(FRONTEND, '')} · ${malos.join(' ')}`);
    }
    expect(culpables).toEqual([]);
  });

  it('y las pantallas de compras leen el folio guardado', () => {
    /*
     * La otra mitad: que no armen el folio a mano no basta, tienen que estar
     * leyéndolo. Una pantalla que simplemente dejó de enseñar el folio también
     * pasaría la prueba de arriba.
     */
    if (!FRONTEND) return;
    const PANTALLAS = [
      'app/dashboard/compras/ordenes/page.tsx',
      'app/dashboard/compras/ordenes/[id]/page.tsx',
      'app/dashboard/compras/ordenes/[id]/pdf/page.tsx',
      'app/dashboard/compras/cotizaciones/page.tsx',
      'app/dashboard/compras/cotizaciones/[id]/pdf/page.tsx',
      'app/dashboard/compras/cotizaciones/requisicion/[id]/page.tsx',
      'app/dashboard/compras/requisiciones/page.tsx',
      'app/dashboard/compras/requisiciones/[id]/page.tsx',
      'app/dashboard/compras/requisiciones/[id]/pdf/page.tsx',
      'app/dashboard/compras/aprobaciones/page.tsx',
      'app/dashboard/compras/pago-proveedores/page.tsx',
      'app/dashboard/compras/devoluciones/page.tsx',
      'app/dashboard/inventario/recepciones/page.tsx',
      'app/dashboard/inventario/recepciones/[id]/page.tsx',
    ];
    for (const ruta of PANTALLAS) {
      const texto = pantalla(ruta);
      if (!texto) continue;
      expect([ruta, texto.includes('folioDe(')]).toEqual([ruta, true]);
    }
  });

  it('y el prefijo vive en un solo lugar de cada lado', () => {
    if (!FRONTEND) return;
    const lib = readFileSync(join(FRONTEND, 'lib/folios.ts'), 'utf8');
    /* Los dos catálogos tienen que decir lo mismo o volvemos a dos verdades. */
    for (const [clave, valor] of Object.entries(TIPOS_DE_FOLIO)) {
      expect([clave, lib.includes(`${clave}: '${valor}'`)]).toEqual([
        clave,
        true,
      ]);
    }
  });
});

describe('La migración rellena hacia atrás sin pisar nada', () => {
  const migracion = fuente(
    'database',
    'migrations',
    'postgres',
    '1790800000000-UnFolioQueSePuedaDecir.ts',
  );

  it('numera por fecha, y desempata por id', () => {
    /*
     * Sin el segundo criterio, dos documentos del mismo instante quedarían a
     * merced del plan de ejecución y dos instalaciones de la misma base
     * numerarían distinto.
     */
    expect(migracion).toMatch(/ORDER BY d\.\$\{fecha\} ASC, d\.id ASC/);
  });

  it('parte el consecutivo por empresa y por ejercicio', () => {
    expect(migracion).toMatch(/PARTITION BY d\.empresaid, \$\{anioDe\('d'\)\}/);
  });

  it('el año sale de la zona del negocio con UN SOLO `AT TIME ZONE`', () => {
    /*
     * ========================================================================
     * Esta prueba estuvo mal, y de la peor manera: PASABA.
     *
     * Exigía `… AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City'`, que es
     * lo que la migración hacía y que está MAL. Estas columnas son
     * `timestamptz`: sobre ellas, el primer `AT TIME ZONE 'UTC'` ya devuelve un
     * `timestamp` sin zona y el segundo lo INTERPRETA como hora de México en
     * vez de convertirlo a ella, así que suma seis horas donde había que
     * restarlas. El año del folio salía mal justo en el cruce de ejercicio, que
     * es lo único que ese cálculo existe para acertar.
     *
     * Y cuando se corrigió la migración, la prueba SIGUIÓ PASANDO, porque la
     * expresión vieja aparecía en el comentario que explica el defecto: estaba
     * midiendo la prosa, no el código. Es el mismo error que ya se cometió con
     * `MAX(` y con `getFullYear()`, y por eso aquí se mide sobre el código sin
     * comentarios.
     *
     * Se descubrió corriendo la migración contra un PostgreSQL de verdad con
     * datos a ambos lados del 31 de diciembre. Ninguna prueba estática lo
     * habría visto: sólo ejecutarla.
     * ========================================================================
     */
    const codigo = sinComentarios(migracion);
    expect(codigo).toMatch(/AT TIME ZONE 'America\/Mexico_City'/);
    expect(codigo).not.toMatch(/AT TIME ZONE 'UTC'/);
  });

  it('se puede volver a correr si se interrumpió', () => {
    /*
     * Un relleno que sólo funciona la primera vez es un relleno que falla el
     * día que algo salió mal. Se arranca desde el consecutivo más alto ya
     * repartido, LEÍDO DEL FOLIO y no contando filas: contar supone que no hay
     * huecos, y si los hubiera el siguiente documento pisaría uno existente.
     */
    expect(migracion).toMatch(/WITH ya_tienen AS/);
    expect(migracion).toMatch(/MAX\(SUBSTRING\(d\.folio FROM '\(\[0-9\]\{6\}\)\$'\)::int\)/);
    expect(migracion).toMatch(/\+ COALESCE\(y\.tope, 0\) AS consecutivo/);
  });

  it('y deja la secuencia en el último número repartido', () => {
    /*
     * Sin esto el primer documento nuevo pediría el 1 y chocaría con el índice
     * único: el alta fallaría con un error de llave duplicada que nadie sabría
     * leer.
     */
    expect(migracion).toMatch(/INSERT INTO folio_secuencias/);
    expect(migracion).toMatch(
      /DO UPDATE SET ultimo = GREATEST\(folio_secuencias\.ultimo, EXCLUDED\.ultimo\)/,
    );
  });

  it('el índice único se crea DESPUÉS de rellenar', () => {
    /*
     * Al revés, el relleno chocaría consigo mismo en una base que ya tuviera
     * folios parciales, y la migración abortaría a medias.
     */
    const iRelleno = migracion.indexOf('UPDATE ${tabla} t');
    const iIndice = migracion.indexOf('CREATE UNIQUE INDEX');
    expect(iRelleno).toBeGreaterThan(-1);
    expect(iIndice).toBeGreaterThan(iRelleno);
  });

  it('es reversible', () => {
    expect(migracion).toMatch(/public async down/);
    expect(migracion).toMatch(/DROP COLUMN IF EXISTS folio/);
    expect(migracion).toMatch(/DROP TABLE IF EXISTS folio_secuencias/);
  });

  it('salta las tablas que no existan en esa instalación', () => {
    expect(migracion).toMatch(/if \(!\(await this\.existe\(queryRunner, tabla\)\)\) continue;/);
  });
});

describe('La etiqueta del asiento lleva el folio, y no es la llave', () => {
  const ordenes = fuente('compras', 'services', 'ordenes-compra.service.ts');

  it('la recepción y el pago etiquetan su asiento con su folio', () => {
    /*
     * `folioDocumento` es lo que se lee en el tablero del cierre contable y en
     * los mensajes de error cuando un asiento falla. Decía
     * `RECEPCION-95692DBB`: un recorte del uuid que no corresponde a ningún
     * número que el almacenista tenga en su pantalla, así que un asiento
     * atorado no se podía amarrar a su documento sin consultar la base.
     */
    const limpio = sinComentarios(ordenes);
    expect(limpio).toMatch(/folioDe\(recepcion, TIPOS_DE_FOLIO\.RECEPCION\),/);
    expect(limpio).toMatch(/folioDe\(pago, TIPOS_DE_FOLIO\.PAGO_PROVEEDOR\),/);
    expect(limpio).not.toMatch(/`RECEPCION-\$\{/);
    expect(limpio).not.toMatch(/`PAGO-OC-\$\{/);
  });

  it('y cabe en la columna, que es lo que ya rompió una vez', () => {
    /*
     * `folioDocumento` es varchar(40). Antes se metía ahí `PAGO-OC-` + el uuid
     * entero: 44 caracteres. PostgreSQL abortaba la transacción con un mensaje
     * que no nombra el campo y el pago a proveedor no se podía registrar
     * NUNCA. `PP-2026-000001` son 14; incluso con seis dígitos desbordados
     * sobran veinte.
     */
    const entidad = fuente('finanzas', 'entities', 'asiento-pendiente.entity.ts');
    expect(entidad).toMatch(/@Column\(\{ type: 'varchar', length: 40, nullable: true \}\)\s*\n\s*folioDocumento/);
    expect(formatearFolio('PP', 2026, 1).length).toBeLessThan(40);
    expect(formatearFolio('RECEPCION', 2026, 1234567).length).toBeLessThan(40);
  });

  it('el dedupe sigue siendo por documento, NO por la etiqueta', () => {
    /*
     * ========================================================================
     * El invariante que de verdad importa, y la razón de que cambiar la
     * etiqueta sea seguro.
     *
     * La idempotencia del motor contable vive en el índice único
     * (empresaId, tipo, documentoId) sobre el uuid COMPLETO del documento. Si
     * alguien «simplificara» esto deduplicando por `folioDocumento` —que es
     * texto, y hasta hoy era un recorte de uuid de 32 bits— dos documentos
     * distintos empezarían a parecer el mismo reintento y el segundo asiento
     * se descartaría EN SILENCIO: una póliza que nunca se genera, sin error,
     * sin aviso, y detectable sólo al no cuadrar el mes.
     * ========================================================================
     */
    const entidad = fuente('finanzas', 'entities', 'asiento-pendiente.entity.ts');
    expect(entidad).toMatch(
      /\['empresaId', 'tipo', 'documentoId'\],\s*\{ unique: true, where: 'documentoId IS NOT NULL' \}/,
    );

    const servicio = sinComentarios(
      fuente('finanzas', 'services', 'asientos-pendientes.service.ts'),
    );
    expect(servicio).toMatch(/where: \{ empresaId, tipo, documentoId \}/);
    /* La etiqueta no participa en la búsqueda del existente. */
    expect(servicio).not.toMatch(/where: \{[^}]*folioDocumento/);
  });
});

describe('Y el año mal calculado se corrige donde ya se aplicó', () => {
  /*
   * ==========================================================================
   * La migración original ya corrió en la base de Abel con la expresión mala,
   * así que corregirla no basta: una instalación que ya la pasó no la repite.
   * `ElAnioDelFolioEnLaZonaDelNegocio` es para ésas.
   *
   * Se verificó contra un PostgreSQL de verdad reproduciendo el daño exacto:
   * dos órdenes del 31 de diciembre por la tarde con folio de 2027. La
   * correctora las devolvió a 2026 y dejó intacta la del 1 de enero.
   * ==========================================================================
   */
  const correctora = fuente(
    'database',
    'migrations',
    'postgres',
    '1790830000000-ElAnioDelFolioEnLaZonaDelNegocio.ts',
  );
  const codigo = sinComentarios(correctora);

  it('compara el año del folio contra el año real', () => {
    expect(codigo).toMatch(/SUBSTRING\(d\.folio FROM '\^\$\{tipo\}-\(\[0-9\]\{4\}\)-'\)::int/);
    expect(codigo).toMatch(/AT TIME ZONE 'America\/Mexico_City'/);
    expect(codigo).not.toMatch(/AT TIME ZONE 'UTC'/);
  });

  it('toca SÓLO los que están mal', () => {
    /*
     * Lo que separa esta migración de un renumerado general. Renumerar la serie
     * entera dejaría la numeración coherente y le cambiaría el folio a
     * documentos que ya se imprimieron o se dictaron por teléfono. Entre un
     * hueco explicable y un folio que cambia debajo de quien ya lo usó, el
     * hueco.
     */
    expect(codigo).toMatch(/<> \$\{anioOk\}/);
  });

  it('arranca desde el máximo que ya hay en el año correcto', () => {
    /* Si no, el folio corregido chocaría con uno existente de ese año. */
    expect(codigo).toMatch(/\+ COALESCE\(p\.ultimo, 0\)\)::text, 6, '0'\)/);
  });

  it('resiembra las secuencias aunque no corrija ninguna fila', () => {
    /*
     * Las sembró la migración original con los años mal calculados: puede
     * haber una fila de un ejercicio que no existe y faltar la del que sí.
     */
    expect(codigo).toMatch(/INSERT INTO folio_secuencias/);
    expect(codigo).toMatch(/GREATEST\(folio_secuencias\.ultimo, EXCLUDED\.ultimo\)/);
  });

  it('castea la empresa, que en una de las tablas es varchar', () => {
    /*
     * `devoluciones_proveedor.empresaid` es `varchar(36)` y las demás `uuid`.
     * Sin el casteo, PostgreSQL aborta con «column empresaid is of type uuid
     * but expression is of type character varying» y revierte la migración
     * entera. Pasó la primera vez que se corrió, sobre la base de Abel.
     */
    expect(codigo).toMatch(/d\.empresaid::uuid/);
    const contar = fuente(
      'database', 'migrations', 'postgres', '1790810000000-ContarNoEsLeerElMaximo.ts',
    );
    expect(sinComentarios(contar)).toMatch(/SELECT empresaid::uuid,/);
  });

  it('no se deshace', () => {
    /*
     * Devolver un folio a su año equivocado no es un estado al que nadie
     * quiera volver, y las filas corregidas ya no se distinguen de las que
     * siempre estuvieron bien.
     */
    expect(correctora).toMatch(/public async down\(\): Promise<void> \{/);
    expect(codigo).not.toMatch(/down[\s\S]*DROP|down[\s\S]*DELETE/);
  });
});
