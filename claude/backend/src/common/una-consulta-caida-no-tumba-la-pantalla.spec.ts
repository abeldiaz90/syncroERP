import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import { moduloDeRuta } from '../iam/data/modulos-catalogo';

/**
 * ============================================================================
 * Una consulta que se cae no tumba la pantalla entera
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Tres veces el mismo día, con tres pantallas distintas:
 *
 *   · El punto de venta pedía los almacenes junto con lo demás. Como los
 *     almacenes no son del mostrador, el 403 dejaba la lista vacía y el botón
 *     «Cobrar» apagado para siempre.
 *   · Recepción y caja pedía las cuentas bancarias —de Tesorería— en el mismo
 *     `Promise.all` que los huéspedes hospedados. El 403 rechazaba la promesa
 *     entera y la pantalla decía «No hay huéspedes con check-in pendiente de
 *     salida» con un huésped dentro.
 *   · City Ledger hacía lo mismo con tres: la cartera salía en ceros como si
 *     estuviera cobrada.
 *
 * El patrón es siempre éste: una pantalla agrupa consultas de MÓDULOS
 * DISTINTOS en un solo `Promise.all` con un solo `try/catch`. Basta que el rol
 * no tenga uno de esos módulos —que es lo normal: por eso son módulos— para
 * que la pantalla entera se quede sin datos y, peor, los presente como un
 * estado vacío legítimo. Por API no se ve: cada endpoint contesta lo que debe.
 *
 * LA REGLA
 *
 * En un `Promise.all` que cruza módulos, sin defensa propia puede quedar como
 * mucho UN módulo: el de la pantalla, cuyo fallo sí significa que la pantalla
 * no puede trabajar. Todo lo que venga de otro módulo lleva `intentar(...)`,
 * `conPermiso(...)` o su propio `.catch(...)`. Que falte un dato prestado es
 * una cosa; que la pantalla mienta sobre lo suyo es otra.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que no vuelva a aparecer un grupo de consultas de dos módulos distintos sin
 * defensa individual. Los módulos se leen del catálogo del backend, que es la
 * misma autoridad que decide los permisos.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function fuentes(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (/\.tsx?$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

/** El texto entre `Promise.all([` y su `])`, contando corchetes. */
function grupo(texto: string, desde: number): string {
  const inicio = texto.indexOf('[', desde);
  if (inicio < 0) return '';
  let nivel = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === '[') nivel++;
    else if (texto[i] === ']') {
      nivel--;
      if (nivel === 0) return texto.slice(inicio + 1, i);
    }
  }
  return '';
}

/**
 * Corta el grupo en sus elementos de primer nivel. Un elemento puede llevar
 * comas dentro de paréntesis o llaves, así que se cuenta profundidad.
 */
function elementos(cuerpo: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of cuerpo) {
    if ('([{'.includes(c)) nivel++;
    else if (')]}'.includes(c)) nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

const RUTA_API = /["'`](\/[a-z0-9][a-z0-9\-/]*)/i;

describe('Pantallas · una consulta que se cae no tumba la pantalla entera', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const archivos = fuentes(join(FRONTEND, 'app')).map((ruta) => ({
    ruta: relative(FRONTEND, ruta).split(sep).join('/'),
    texto: readFileSync(ruta, 'utf8'),
  }));

  it('ningún Promise.all cruza módulos sin defensa por consulta', () => {
    const culpables: string[] = [];

    for (const { ruta, texto } of archivos) {
      let desde = 0;
      for (;;) {
        const i = texto.indexOf('Promise.all(', desde);
        if (i < 0) break;
        desde = i + 12;

        const cuerpo = grupo(texto, i);
        if (!cuerpo) continue;
        const partes = elementos(cuerpo);

        const conRuta = partes
          .map((parte) => ({ parte, m: RUTA_API.exec(parte) }))
          .filter((x) => x.m && !x.m[1].startsWith('/dashboard'))
          .map((x) => ({ parte: x.parte, api: x.m![1] }));
        if (conRuta.length < 2) continue;

        /*
         * «catalogos» —bancos y formas de pago del SAT, países y estados— no
         * entra en la cuenta: sus lecturas van marcadas `@SkipPermisos()`, no
         * las puede negar ningún perfil, y pedirles red sería pedir defensa
         * contra algo que no ocurre.
         */
        const propios = (rutas: typeof conRuta) =>
          new Set(
            rutas
              .map((x) => moduloDeRuta(x.api))
              .filter((m) => m !== 'catalogos'),
          );

        if (propios(conRuta).size < 2) continue;

        /*
         * Sin red puede quedarse un solo módulo: el de la pantalla, cuyo fallo
         * sí significa que la pantalla no puede trabajar. Dos módulos sin red
         * es el defecto: el 403 de uno se lleva por delante lo del otro.
         */
        /*
         * La cuarta forma de defenderse, y la mejor de las cuatro.
         * ---------------------------------------------------------------
         * `peticion(...)` a secas —sin `.then`, sin `.json()`— se resuelve
         * con la `Response`, y una `Response` con 403 NO rechaza la promesa:
         * el grupo entero llega completo y la pantalla mira `r.ok` de cada
         * una después, por separado. Eso es exactamente lo que piden las dos
         * reglas de este archivo: la consulta negada no se lleva a las demás
         * Y la pantalla puede decir CUÁL se cayó, porque tiene el `status`
         * delante.
         *
         * Antes esta forma no se veía: estas pantallas escribían
         * `fetch(\`${apiUrl}/...\`)` y la ruta no quedaba entre comillas al
         * principio, así que el detector pasaba de largo. Al migrarlas a
         * `peticion('/...')` aparecieron las seis de golpe —ninguna era nueva,
         * ninguna estaba mal— y lo que faltaba era que la prueba supiera leer.
         *
         * Se exige lo que hace falta para que la forma sea de verdad una
         * defensa: que el archivo compruebe `.ok` al menos tantas veces como
         * peticiones crudas haya en el grupo. Una `Response` que nadie mira es
         * el silencio de siempre con otra cara.
         */
        const crudas = conRuta.filter((x) =>
          /peticion\s*\(/.test(x.parte) && !/\.then\s*\(|\.json\s*\(/.test(x.parte),
        );
        const compruebaCadaUna =
          crudas.length > 0 &&
          (texto.match(/\.ok\b/g) ?? []).length >= crudas.length;

        const desprotegidas = conRuta.filter((x) => {
          /* `intentar<T>(…)` y `conPermiso<T>(…)` también cuentan. */
          if (/(?:intentar|conPermiso)\s*(?:<[^>]*>)?\s*\(|\.catch\s*\(/.test(x.parte))
            return false;
          if (compruebaCadaUna && crudas.includes(x)) return false;
          return true;
        });
        const sinRed = propios(desprotegidas);
        if (sinRed.size > 1) {
          culpables.push(
            `${ruta} → ${desprotegidas.map((x) => x.api).join(', ')} [${[...sinRed].join(' + ')}]`,
          );
        }
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  /*
   * ════════════════════════════════════════════════════════════════════════
   * El escalón siguiente de la misma herida
   * ------------------------------------------------------------------------
   * La regla de arriba acepta `.catch(…)` como defensa, y es verdad que
   * defiende: la pantalla ya no se cae. Pero `.catch(() => [])` hace algo más
   * que no caerse —convierte «no puedo leerlo» en «no hay»— y eso la pantalla
   * lo cuenta como una buena noticia:
   *
   *   · Devoluciones a proveedor decía «No hay órdenes recibidas: sólo se
   *     puede devolver lo que ya entró» y «Todavía no hay devoluciones» a un
   *     rol que simplemente no podía leerlas.
   *   · Transferencias dejaba el buscador de producto vacío, sin una palabra,
   *     y parecía que la empresa no tiene catálogo.
   *
   * Un desplegable vacío sin explicación es peor que un error, porque nadie
   * pregunta por él: se asume y se abandona la pantalla.
   *
   * `conPermiso` e `intentar` existen justo para esto: devuelven el dato Y si
   * estaba vedado, que es lo que permite a la pantalla decir cuál de las dos
   * cosas pasó. Así que en un `Promise.all` que cruza módulos, un `.catch`
   * a secas ya no cuenta como defensa suficiente.
   * ════════════════════════════════════════════════════════════════════════
   */
  it('en un Promise.all que cruza módulos, un `.catch` a secas no basta', () => {
    const culpables: string[] = [];

    for (const { ruta, texto } of archivos) {
      let desde = 0;
      for (;;) {
        const i = texto.indexOf('Promise.all(', desde);
        if (i < 0) break;
        desde = i + 12;

        const cuerpo = grupo(texto, i);
        if (!cuerpo) continue;
        const partes = elementos(cuerpo);

        const conRuta = partes
          .map((parte) => ({ parte, m: RUTA_API.exec(parte) }))
          .filter((x) => x.m && !x.m[1].startsWith('/dashboard'))
          .map((x) => ({ parte: x.parte, api: x.m![1] }));
        if (conRuta.length < 2) continue;

        const modulos = new Set(
          conRuta.map((x) => moduloDeRuta(x.api)).filter((m) => m !== 'catalogos'),
        );
        if (modulos.size < 2) continue;

        /*
         * Lo que se busca: la consulta que se defiende SÓLO con un `.catch`
         * que devuelve vacío. Un `.catch` que avisa, que marca un estado o que
         * vuelve a lanzar no cuenta aquí: ésos sí dejan a la pantalla contar
         * lo que pasó.
         */
        const mudas = conRuta.filter((x) => {
          if (/(?:intentar|conPermiso)\s*(?:<[^>]*>)?\s*\(/.test(x.parte)) return false;
          if (
            /\.catch\s*\(\s*\(\s*\)\s*=>\s*(\[\s*\]|null|undefined|\{\s*\})\s*\)/.test(
              x.parte,
            )
          )
            return true;
          /*
           * El mismo silencio sin `.catch`: `.then(r => r.ok ? r.json() : [])`
           * no se cae, no avisa, y deja el desplegable vacío. Da igual que la
           * mordaza esté en el `catch` o en el ternario del `then`.
           */
          return /\.then\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.ok\s*\?[^\]]*:\s*(\[\s*\]|null|undefined|\{\s*\})\s*\)/.test(
            x.parte,
          );
        });

        if (mudas.length) {
          culpables.push(`${ruta} → ${mudas.map((x) => x.api).join(', ')}`);
        }
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  /*
   * ════════════════════════════════════════════════════════════════════════
   * La prueba de la prueba
   * ------------------------------------------------------------------------
   * Las dos reglas de arriba están escritas con expresiones regulares sobre
   * el texto de las pantallas, y una expresión regular se rompe en silencio:
   * sigue corriendo, sigue pasando, y ya no mira nada. Pasó aquí mismo —
   * `[^]]` no es «cualquiera menos corchete» en JavaScript, es «cualquiera»
   * seguido de corchetes literales— y la regla quedó un rato sin poder fallar.
   *
   * Así que las muestras van escritas: una mordaza de cada forma conocida,
   * que la regla TIENE que señalar, y dos defensas de verdad, que no debe
   * tocar. Si alguien vuelve a tocar la expresión, esto se cae primero.
   * ════════════════════════════════════════════════════════════════════════
   */
  describe('los detectores distinguen una mordaza de una defensa', () => {
    const MUDA =
      /\.then\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.ok\s*\?[^\]]*:\s*(\[\s*\]|null|undefined|\{\s*\})\s*\)/;
    const esCruda = (parte: string) =>
      /peticion\s*\(/.test(parte) && !/\.then\s*\(|\.json\s*\(/.test(parte);

    const MORDAZAS = [
      ['la que tenía productos', 'peticion(`/catalogo/categorias`, { headers: h }).then(r => r.ok ? r.json() : [])'],
      ['a null en vez de vacío', 'peticion(`/x/y`).then(res => res.ok ? res.json() : null)'],
      ['con paréntesis', 'peticion(`/x/y`).then((r) => r.ok ? r.json() : {})'],
    ];
    const DEFENSAS = [
      ['un then que sí avisa', 'peticion(`/x/y`).then(r => { if (!r.ok) setErrorCarga(1); return r.json(); })'],
      ['una petición cruda', 'peticion(`/credito/cuentas-bancarias`, { headers: h() })'],
    ];

    it.each(MORDAZAS)('señala la mordaza: %s', (_nombre, muestra) => {
      expect(MUDA.test(muestra)).toBe(true);
    });

    it.each(DEFENSAS)('no señala la defensa: %s', (_nombre, muestra) => {
      expect(MUDA.test(muestra)).toBe(false);
    });

    it('sólo cuenta como cruda la petición que devuelve la Response', () => {
      expect(esCruda('peticion(`/credito/cuentas-bancarias`, { headers: h() })')).toBe(true);
      expect(esCruda('peticion(`/x/y`).then(r => r.ok ? r.json() : [])')).toBe(false);
      expect(esCruda('peticion(`/x/y`).then(r => r.json())')).toBe(false);
    });

    it('la regla real usa estas mismas expresiones', () => {
      /*
       * Copiar la expresión a la muestra es el error clásico: las dos quedan
       * iguales y las dos quedan mal. Así que se lee el archivo y se exige que
       * el texto de la regla sea el mismo que el de la muestra.
       */
      const propio = readFileSync(__filename, 'utf8');
      const veces = propio.split(MUDA.source).length - 1;
      expect(veces).toBeGreaterThanOrEqual(2);
    });
  });
});
