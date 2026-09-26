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
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
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
        const desprotegidas = conRuta.filter(
          (x) =>
            /* `intentar<T>(…)` y `conPermiso<T>(…)` también cuentan. */
            !/(?:intentar|conPermiso)\s*(?:<[^>]*>)?\s*\(|\.catch\s*\(/.test(
              x.parte,
            ),
        );
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
});
