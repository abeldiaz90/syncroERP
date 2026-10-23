/**
 * ============================================================================
 * Una pantalla que se ofrece con la puerta cerrada
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El menú decide si te ofrece una pantalla mirando UNA ruta: la que la hace
 * navegable. Pero una pantalla pide muchas más al abrirse, y ésas salen de
 * otros módulos. Cuando el rol tiene la ruta de la puerta y no las de dentro,
 * la pantalla se abre y no sirve —y casi nunca lo dice.
 *
 * Tres veces medido, tres formas distintas de no decirlo:
 *
 *   · ESTADO DE CUENTA. Tesorería puede leer el reporte y no el padrón de
 *     clientes, que es la única puerta de entrada de la pantalla. Escribía un
 *     nombre en el buscador y no encontraba a nadie. Nunca.
 *   · COBRANZA. El mostrador cobra una cuota en caja, y la pantalla pedía el
 *     catálogo completo de cuentas bancarias —con CLABE— para saber dónde cayó
 *     el pago. El desplegable salía vacío, en silencio, y el cobro no se podía
 *     registrar.
 *   · COSTOS DE RECETAS. El hook guardaba el error de los dos catálogos
 *     prestados y nadie lo pintaba: el filtro de almacén se quedaba con una
 *     sola opción, como si la empresa tuviera un almacén, y los nombres de
 *     producto salían como un trozo de identificador.
 *
 * Por API no se ve: cada endpoint contesta exactamente lo que debe. Sólo
 * aparece cruzando TRES cosas que viven separadas —las plantillas de rol, las
 * rutas que hacen navegable cada pantalla, y las llamadas que cada pantalla
 * escribe— y es lo que hace esta prueba.
 *
 * LA REGLA
 *
 * Una pantalla que el menú ofrece a un rol no puede quedarse callada cuando ese
 * rol tiene vedada una de las lecturas que hace al abrirse. O la lectura se le
 * concede —con la vista corta que corresponda, como `para-venta`,
 * `para-cobro` o `para-seleccion`—, o la pantalla nombra lo que falta y qué
 * consecuencia tiene.
 *
 * CÓMO FUNCIONA EL TRINQUETE
 *
 * La deuda está en CERO, y eso es lo que se defiende. El 21-oct-2026 el cruce
 * dio cuarenta y siete renglones: cinco eran defectos y se arreglaron ese día,
 * treinta y cuatro eran pantallas que atienden el 403 DESPUÉS de la llamada —y
 * el detector aprendió a reconocerlas, porque una lista de treinta y cuatro
 * excepciones escritas a mano no es un trinquete, es un trámite— y ocho quedan
 * escritas con su motivo porque hablan sin nombrar el número del 403.
 *
 * La prueba exige tres cosas: que no aparezca ningún cruce que no esté escrito,
 * que la deuda siga en cero, y que ningún renglón escrito haya dejado de
 * medirse.
 *
 * PARA VOLVER A MEDIR: la lista se saca de `hallazgos`. Si hace falta
 * regenerarla, lo más corto es añadir temporalmente un `console.log` de
 * `hallazgos.sort().join('\n')` y correr sólo este archivo.
 *
 * Se descartan solas las rutas con `@SkipPermisos()` —bancos, países, formas de
 * pago, códigos postales—: no las puede negar ningún perfil, y pedirles defensa
 * sería pedirla contra algo que no ocurre. Y sólo se miran LECTURAS: una
 * escritura vive detrás de un botón, y el botón lleva su guarda en el JSX,
 * lejos de la llamada.
 * ============================================================================
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { ENDPOINTS_NAVEGABLES } from './endpoints-navegables';
import { moduloDeRuta } from './modulos-catalogo';
import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/module-config.ts')));

/**
 * NEGADO PERO DICHO, en una pantalla que no nombra el 403.
 * ----------------------------------------------------------------------------
 * Las dos que quedan no distinguen el 403 por su número, así que el filtro de
 * arriba no las reconoce, pero las dos tienen su decisión escrita en el propio
 * código:
 *
 *   · CUENTAS BANCARIAS — sin almacén ni lista de precios la caja se da de alta
 *     igual: su contexto de venta queda sin configurar y el punto de venta usa
 *     el predeterminado, que es lo que hacía antes de que eso existiera. No se
 *     bloquea un alta por un catálogo que ese rol no tiene, y las tres lecturas
 *     que sí son imprescindibles —cuentas, cuentas contables, bancos— se
 *     nombran una por una cuando faltan.
 *   · AVISOS DEL CORE — habla por `ApiError.message` en vez de por el `status`:
 *     «No fue posible leer el buzón». El renglón que queda es la plantilla
 *     `/integracion/avisos${q}`, que es la misma ruta contada otra vez por el
 *     normalizador.
 *
 *     Y YA NO ESTÁ el del buzón huérfano. Llevaba escrito que «si el rol no
 *     alcanza para verlo, la pantalla sigue funcionando», que era verdad a
 *     medias: el `.catch(() => ({ avisos: [] }))` igualaba la negativa, la
 *     avería y la lista vacía, y el titular acababa diciendo «Nada pendiente ·
 *     todo lo recibido fue el eco de operaciones que el ERP mismo originó»
 *     sobre una mitad que no se consultó. MEDIDO el 22-oct-2026 suplantando al
 *     rol `contador`. Ahora distingue el 403 con `conPermiso`, así que el
 *     filtro de arriba lo reconoce solo y no necesita excepción escrita.
 */
const CON_MOTIVO: string[] = [
  'creditos/avisos · contador · GET /integracion/avisos:id',
  'creditos/cuentas-bancarias · cobranza · GET /catalogo/almacenes/para-venta',
  'creditos/cuentas-bancarias · cobranza · GET /catalogo/listas-precio',
  'creditos/cuentas-bancarias · contador · GET /catalogo/almacenes/para-venta',
  'creditos/cuentas-bancarias · finanzas · GET /catalogo/almacenes/para-venta',
  'creditos/cuentas-bancarias · tesoreria · GET /catalogo/almacenes/para-venta',
  'creditos/cuentas-bancarias · tesoreria · GET /catalogo/listas-precio',
];

/**
 * LA DEUDA: una pantalla que se ofrece, recibe un no, y sigue como si hubiera
 * recibido un vacío.
 *
 * Está VACÍA, y eso es el estado que hay que defender, no una casualidad. El
 * 21-oct-2026 el cruce dio 47 renglones; 34 eran pantallas que atienden el 403
 * después de la llamada y el detector no sabía verlo, 5 se arreglaron ese día
 * —estado de cuenta, cobranza, costos de recetas, corte de caja, clientes
 * desde el CRM— y 8 quedaron arriba con su motivo escrito. El 22-oct-2026, el
 * barrido rol por rol desde el navegador arregló el del buzón huérfano, así
 * que son 7.
 *
 * Si algo aparece aquí, es que una pantalla nueva —o una que cambió— se abre
 * para un rol al que le niegan una de sus lecturas y no se lo dice a nadie.
 */
const DEUDA: string[] = [];

const DEUDA_MAXIMA = DEUDA.length;

/* Rutas que ningún perfil puede negar. Se leen de los controladores. */
function conSkipPermisos(dir: string, acumulado: Set<string> = new Set()): Set<string> {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) conSkipPermisos(ruta, acumulado);
    else if (nombre.endsWith('.controller.ts')) {
      /*
       * Sin comentarios. Este extractor se equivocó primero por leerlos: dos
       * controladores EXPLICAN en su encabezado que NO llevan `@SkipPermisos()`
       * —y dicen por qué—, y el buscador tomó la mención por el decorador. El
       * resultado fue que la puerta de «Ver como» y la de activos salían libres,
       * los trece roles parecían verlas, y el cruce inventó treinta hallazgos.
       * Una prueba que lee prosa como si fuera código mide lo que nadie
       * escribió.
       */
      const texto = readFileSync(ruta, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      const base = /@Controller\(\s*['"]([^'"]*)['"]/.exec(texto)?.[1] ?? '';
      const re = /@(Get|Post|Patch|Put|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto))) {
        const trozo = texto.slice(0, m.index).split(/@(?:Get|Post|Patch|Put|Delete)\(/).pop() ?? '';
        if (!/@SkipPermisos\(\)/.test(trozo)) continue;
        const sub = m[2] ?? '';
        const r = ('/' + base + (sub ? '/' + sub : ''))
          .replace(/\/+/g, '/')
          .replace(/\/$/, '')
          .replace(/:[A-Za-z_]\w*/g, ':id');
        acumulado.add(`${m[1].toUpperCase()} ${r}`);
      }
    }
  }
  return acumulado;
}

const normalizar = (r: string) =>
  r.replace(/\$\{[^}]*\}/g, ':id').replace(/\?.*$/, '').replace(/\/$/, '');

function pantallas(dir: string, base = ''): string[] {
  const a: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) a.push(...pantallas(ruta, base ? base + '/' + nombre : nombre));
    else if (nombre === 'page.tsx' && base) a.push(base);
  }
  return a;
}

describe('IAM · una pantalla que se ofrece con la puerta cerrada', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que cruzar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const LIBRES = conSkipPermisos(join(__dirname, '..', '..'));

  function puede(plantilla: any, metodo: string, ruta: string): boolean {
    const clave = `${metodo} ${normalizar(ruta)}`;
    if (LIBRES.has(clave)) return true;
    if ((plantilla.accionesVedadas ?? []).includes(clave)) return false;
    if ((plantilla.accionesIrrenunciables ?? []).includes(clave)) return true;
    const modulo = moduloDeRuta(normalizar(ruta));
    if (!modulo) return false;
    if ((plantilla.modulosVedados ?? []).includes(modulo)) return false;
    if ((plantilla.modulos ?? []).includes(modulo)) return true;
    if (metodo === 'GET' && (plantilla.modulosConsulta ?? []).includes(modulo)) return true;
    return false;
  }

  /** Qué roles ve el menú con esta pantalla. */
  function rolesQueLaVen(pantalla: string): any[] {
    const puertas = Object.entries(ENDPOINTS_NAVEGABLES as Record<string, any>)
      .filter(([, v]) => v.rutaFrontend === '/dashboard/' + pantalla)
      .map(([k]) => k);
    if (!puertas.length) return [];
    return (PLANTILLAS_PERMISOS as any[]).filter((p) =>
      puertas.some((k) => {
        const [m, r] = k.split(' ');
        return puede(p, m, r);
      }),
    );
  }

  /** Las llamadas que la pantalla escribe, y si llevan guarda cerca. */
  function llamadasDe(texto: string): Map<string, boolean> {
    const mapa = new Map<string, boolean>();
    const re =
      /(?:peticion|api\.(get|post|patch|put|delete))\s*(?:<[^>()]*>)?\s*\(\s*[`'"](\/[^`'"]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const ruta = normalizar(m[2]);
      const antes = texto.slice(Math.max(0, m.index - 600), m.index);
      const guardada =
        /tienePermiso\(|conPermiso|PuedeCrear|PuedeEditar|plan\?\.|busqueda\.length|\.length\s*<\s*2/.test(
          antes,
        );
      const tramo = texto.slice(m.index, m.index + 400);
      const metodo = m[1]
        ? m[1].toUpperCase()
        : (/method:\s*['"](POST|PATCH|PUT|DELETE)/i.exec(tramo)?.[1] ?? 'GET').toUpperCase();
      const clave = `${metodo} ${ruta}`;
      mapa.set(clave, (mapa.get(clave) ?? true) && guardada);
    }
    return mapa;
  }

  /**
   * La pantalla que HABLA de negativas.
   * -------------------------------------------------------------------------
   * Este cruce sólo sabe ver guardas ANTES de la llamada —un `tienePermiso(…)`,
   * un `conPermiso(…)`, un largo mínimo de búsqueda— y casi ninguna pantalla se
   * defiende así. Se defienden DESPUÉS: miran el `status`, distinguen el 403 de
   * una avería, y lo dicen. De los cuarenta y siete cruces que salieron el
   * 21-oct-2026, TREINTA Y CUATRO eran de esas: ya cumplían la regla y hubo que
   * sacarlos a mano.
   *
   * Una lista de treinta y cuatro renglones escritos a mano no es un trinquete:
   * es un trámite. La pantalla nueva lo tropieza, alguien añade su línea sin
   * pensarla, y el día que aparezca una de verdad va a entrar por la misma
   * puerta sin que nadie la mire.
   *
   * Así que se reconoce la otra forma: una pantalla que en su código distingue
   * el 403 —por el `status`, por `esSinPermisos`/`esNoAutorizado`, o repartiendo
   * un `allSettled` para no confundir el permiso con la avería— es una pantalla
   * que sabe que una lectura puede negársele. Lo que esta prueba persigue es la
   * que NO lo sabe: la que pide, recibe un no, y sigue como si hubiera recibido
   * un vacío.
   *
   * Se pierde resolución —una pantalla puede hablar de UNA negativa y callarse
   * otra—, y eso lo cubren las reglas vecinas, que miran consulta por consulta:
   * `una-consulta-caida-no-tumba-la-pantalla`, `una-pantalla-que-afirmaba-un-
   * vacio`, `un-reporte-sin-datos-no-es-un-reporte-en-cero`. Lo que se gana es
   * que esta lista vuelva a ser corta y, por tanto, legible.
   */
  const hablaDeNegativas = (texto: string) =>
    /\b403\b|esSinPermisos|esNoAutorizado|allSettled/.test(texto);

  const hallazgos: string[] = [];
  for (const pantalla of pantallas(join(FRONTEND, 'app/dashboard'))) {
    const archivo = join(FRONTEND, 'app/dashboard', pantalla, 'page.tsx');
    const fuente = readFileSync(archivo, 'utf8');
    if (hablaDeNegativas(fuente)) continue;
    const llamadas = llamadasDe(fuente);
    for (const plantilla of rolesQueLaVen(pantalla)) {
      for (const [clave, guardada] of llamadas) {
        if (guardada) continue;
        if (!clave.startsWith('GET ')) continue;
        const [metodo, ruta] = clave.split(' ');
        if (puede(plantilla, metodo, ruta)) continue;
        hallazgos.push(`${pantalla} · ${plantilla.rol} · ${clave}`);
      }
    }
  }

  it('el cruce mide algo: hay pantallas, roles y llamadas', () => {
    /*
     * Si cualquiera de las tres fuentes dejara de leerse —el catálogo de
     * navegables, las plantillas o las llamadas del frontend— el cruce saldría
     * vacío y la prueba pasaría sin mirar nada. Es el accidente que ya pasó
     * cuatro veces en este repositorio cuando una expresión se quedó buscando
     * `fetch` después de la migración a `peticion`.
     */
    expect(pantallas(join(FRONTEND!, 'app/dashboard')).length).toBeGreaterThan(100);
    expect((PLANTILLAS_PERMISOS as any[]).length).toBeGreaterThan(8);
    expect(Object.keys(ENDPOINTS_NAVEGABLES).length).toBeGreaterThan(50);
    expect(LIBRES.size).toBeGreaterThan(10);
  });

  it('no aparece ninguna pantalla cerrada que no esté escrita', () => {
    const escritos = new Set([...DEUDA, ...CON_MOTIVO]);
    const nuevos = hallazgos.filter((h) => !escritos.has(h)).sort();
    expect(nuevos).toEqual([]);
  });

  it('la deuda no crece', () => {
    const callados = hallazgos.filter((h) => !CON_MOTIVO.includes(h));
    expect(callados.length).toBeLessThanOrEqual(DEUDA_MAXIMA);
  });

  it('LA PRUEBA DE LA PRUEBA: la lista escrita no tiene renglones muertos', () => {
    /*
     * Un renglón que ya no se mide es peor que ninguno: hace creer que la deuda
     * sigue ahí y, cuando alguien la rompe de verdad, el techo tiene holgura
     * para absorberlo. Al arreglar una pantalla se borra su renglón.
     */
    const muertos = [...DEUDA, ...CON_MOTIVO]
      .filter((d) => !hallazgos.includes(d))
      .sort();
    expect(muertos).toEqual([]);
  });
});
