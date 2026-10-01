/**
 * ============================================================================
 * Una fecha por omisión que proponía mañana
 * ----------------------------------------------------------------------------
 * CÓMO EMPEZÓ, Y EL ERROR QUE COMETÍ
 *
 * Abrí el Libro Diario para comprobar otra cosa y vi el filtro en 01/09–30/09.
 * Mi entorno da la fecha en UTC, así que creí que era 1 de octubre y que la
 * pantalla abría en el mes pasado. **Me equivoqué**: en México eran las 23:27
 * del 30 de septiembre y el filtro estaba bien.
 *
 * Queda escrito porque el error llevó a encontrar el defecto de verdad, y
 * porque un archivo de pruebas que presume de lo que no vio enseña a creerle
 * al resto de lo que afirma.
 *
 * ## 1 · Lo real, y comprobado en el reloj
 *
 * La póliza que yo creía excluida por el filtro estaba fechada **01-oct**. No
 * por el filtro: porque la generó una compra de las 18:13 del 30-sep, antes de
 * que se arreglara el huso del lado del servidor.
 *
 * Y ese mismo mecanismo seguía vivo en la pantalla:
 *
 *     new Date().toISOString().slice(0, 10)
 *
 * convierte a UTC antes de recortar. A las 23:27 CST del 30-sep devuelve
 * **2026-10-01**: en México, de las 18:00 en adelante, devuelve el día
 * siguiente. No es una deducción; se midió contra el reloj.
 *
 * Estaba en nueve archivos y **siempre como valor por omisión**, que es el que
 * nadie revisa antes de guardar: la fecha de una **póliza manual**, la de un
 * pago a proveedor, la de un cobro, la de inicio de un **préstamo a un
 * empleado**, la vigencia de una obligación de INFONAVIT, la de un concepto de
 * nómina, la de una devolución a proveedor, la de los saldos iniciales y el
 * tope de un campo en el alta de clientes.
 *
 * Es el defecto que ya costó una corrección en ocho generadores de póliza,
 * reentrando por la puerta de los valores por omisión.
 *
 * ## 2 · Lo latente, que NO vi fallar
 *
 * `const HOY = new Date()` a nivel de módulo se evalúa una sola vez, al cargar
 * el chunk, y con el prerenderizado de Next el valor queda horneado en el
 * build. Eran ocho pantallas de finanzas y reportes. Se corrige porque el
 * riesgo en producción es real, pero **aquí no estaba mordiendo**: lo deduje de
 * la fecha que leí mal, y conviene que eso quede dicho.
 *
 * ## Las dos reglas
 *
 * Son dos defectos distintos y se vigilan por separado, porque confundirlos
 * haría que uno tapara al otro: ninguna constante de módulo nace del reloj, y
 * nadie saca «hoy» pasando por UTC.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const sinComentarios = (t: string) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const pantalla = (relativa: string) =>
  FRONTEND && existsSync(join(FRONTEND, relativa))
    ? sinComentarios(readFileSync(join(FRONTEND, relativa), 'utf8'))
    : '';

/** Las ocho que tenían el defecto. */
const AFECTADAS = [
  'app/dashboard/finanzas/polizas/page.tsx',
  'app/dashboard/finanzas/balanza/page.tsx',
  'app/dashboard/finanzas/estado-resultados/page.tsx',
  'app/dashboard/finanzas/balance-general/page.tsx',
  'app/dashboard/finanzas/declaracion-iva/page.tsx',
  'app/dashboard/reportes/corte-caja/page.tsx',
  'app/dashboard/reportes/estado-cuenta/page.tsx',
  'app/dashboard/reportes/ventas/page.tsx',
];

describe('El helper arma las fechas con el reloj local', () => {
  const lib = FRONTEND
    ? readFileSync(join(FRONTEND, 'lib/fechas.ts'), 'utf8')
    : '';

  it('existe y no pasa por UTC', () => {
    if (!FRONTEND) return;
    expect(lib).toMatch(/export function diaISO/);
    expect(lib).toMatch(/fecha\.getFullYear\(\)/);
    const cuerpo = lib.slice(
      lib.indexOf('export function diaISO'),
      lib.indexOf('export function hoyISO'),
    );
    expect(cuerpo).not.toMatch(/toISOString/);
  });

  it('`mesEnCurso` y `mesHastaHoy` reciben el día, para poder probarse', () => {
    /*
     * Una función que lee el reloj por dentro y no deja pasárselo no se puede
     * probar en un 31 de diciembre sin esperar al 31 de diciembre.
     */
    if (!FRONTEND) return;
    expect(lib).toMatch(/export function mesEnCurso\(hoy: Date = new Date\(\)\)/);
    expect(lib).toMatch(/export function mesHastaHoy\(hoy: Date = new Date\(\)\)/);
  });

  it('el último día del mes sale del día 0 del siguiente', () => {
    /* Así los bisiestos y los meses de 30 salen solos, sin tabla de meses. */
    if (!FRONTEND) return;
    expect(lib).toMatch(/new Date\(hoy\.getFullYear\(\), hoy\.getMonth\(\) \+ 1, 0\)/);
  });
});

describe('Ninguna de las ocho vuelve a congelar el reloj', () => {
  it('no queda `new Date()` a nivel de módulo', () => {
    /*
     * Se mide la COLUMNA: una línea que empieza en `const` sin sangrar está
     * fuera de todo componente. Dentro de una función, `const hoy = new Date()`
     * es correcto y no se toca.
     */
    for (const ruta of AFECTADAS) {
      const texto = pantalla(ruta);
      if (!texto) continue;
      /*
       * La flecha se excluye igual que en la regla general: `const ahora = () =>
       * new Date()` se evalúa al llamarla y es correcto. Un mutante con esa
       * línea hizo fallar la primera versión de esta prueba, y una prueba que
       * se queja del código correcto es ruido que alguien acaba apagando.
       */
      const culpables = texto
        .split('\n')
        .filter(
          (l) =>
            /^const\s+\w+\s*=/.test(l) &&
            /new Date\(\)/.test(l) &&
            !/=>|function/.test(l),
        );
      expect([ruta, culpables]).toEqual([ruta, []]);
    }
  });

  it('ni `toISOString()` para recortar una fecha', () => {
    for (const ruta of AFECTADAS) {
      const texto = pantalla(ruta);
      if (!texto) continue;
      expect([ruta, /toISOString\(\)\.split\(['"]T['"]\)\[0\]/.test(texto)]).toEqual([
        ruta,
        false,
      ]);
    }
  });

  it('y el rango se resuelve al montar, no al cargar el archivo', () => {
    /*
     * `useMemo(..., [])` corre una vez POR MONTAJE: se vuelve a preguntar qué
     * día es cada vez que alguien entra, y no se recalcula en cada tecleo del
     * filtro.
     */
    for (const ruta of AFECTADAS) {
      const texto = pantalla(ruta);
      if (!texto) continue;
      expect([ruta, /useMemo\(/.test(texto)]).toEqual([ruta, true]);
    }
  });
});

describe('La regla, no las ocho pantallas', () => {
  /*
   * ==========================================================================
   * Éstas son las que valen, porque no vigilan ocho rutas: recorren TODAS las
   * pantallas y se caen con la novena. Son dos reglas distintas porque son dos
   * defectos distintos, y confundirlos haría que una tapara a la otra.
   * ==========================================================================
   */
  const archivosDelFrontend = (): string[] => {
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
      const dir = join(FRONTEND!, carpeta);
      if (existsSync(dir)) caminar(dir);
    }
    return archivos;
  };

  it('ninguna pantalla congela el reloj en una constante de módulo', () => {
    /*
     * El criterio es estrecho a propósito: sólo se acusa una línea que declara
     * una constante de módulo A PARTIR del reloj y que NO es una función. Lo
     * que está dentro de un componente, y una flecha como
     * `const hoy = () => ...`, se evalúan cuando toca y son correctos;
     * acusarlos convertiría esta prueba en ruido que alguien acabaría
     * apagando, y una prueba apagada no vigila nada.
     */
    if (!FRONTEND) return;
    const archivos = archivosDelFrontend();
    expect(archivos.length).toBeGreaterThan(50);

    const culpables: string[] = [];
    for (const archivo of archivos) {
      const texto = sinComentarios(readFileSync(archivo, 'utf8'));
      for (const linea of texto.split('\n')) {
        if (!/^const\s+\w+\s*=/.test(linea)) continue;
        if (!/new Date\(\)/.test(linea)) continue;
        /* Una función se evalúa al llamarla: no congela nada. */
        if (/=>|function/.test(linea)) continue;
        culpables.push(`${archivo.replace(FRONTEND!, '')} · ${linea.trim()}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('y ninguna saca «hoy» pasando por UTC', () => {
    /*
     * La segunda regla, que es la que más lejos llegaba: buscando la primera
     * aparecieron nueve archivos más con
     * `new Date().toISOString().slice(0, 10)`, y entre ellos la fecha por
     * omisión de una PÓLIZA MANUAL, de un pago a proveedor, de un cobro, de un
     * préstamo a un empleado y de los saldos iniciales. En México, a partir de
     * las 18:00, todos proponían EL DÍA SIGUIENTE. Es el mismo defecto que ya
     * costó una corrección del lado del servidor —una compra de las 18:13 que
     * quedó fechada al día siguiente— y la pantalla lo estaba reintroduciendo
     * por la puerta de los valores por omisión, que son los que nadie mira.
     *
     * Se vigila el RECORTE a un día de calendario, no `toISOString()` a secas:
     * una marca de tiempo completa en UTC es correcta y se usa para eso mismo.
     */
    if (!FRONTEND) return;
    const culpables: string[] = [];
    for (const archivo of archivosDelFrontend()) {
      const texto = sinComentarios(readFileSync(archivo, 'utf8'));
      const malas = texto.match(
        /*
         * Las comillas, de los dos tipos. La primera versión de esta regla
         * exigía `split('T')` con comilla simple y un mutante que escribió
         * `split("T")` la dejó verde: la regla afirmaba cubrir todo el
         * frontend y cubría una forma de escribirlo.
         */
        /new Date\(\)\.toISOString\(\)\.(?:slice\(0\s*,\s*10\)|split\(['"]T['"]\)\[0\]|substring\(0\s*,\s*10\))/g,
      );
      if (malas) {
        culpables.push(`${archivo.replace(FRONTEND!, '')} · ${malas.length}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
