import { existsSync } from 'fs';

/**
 * ============================================================================
 * Qué navegador arma el PDF
 * ----------------------------------------------------------------------------
 * POR QUÉ ESTO VIVE APARTE
 *
 * Estaba dentro del servicio, en tres líneas que parecían obvias:
 *
 *     const p = require('puppeteer');
 *     if (typeof p.executablePath === 'function' && existsSync(p.executablePath()))
 *       return undefined;              // el suyo está: que lo use
 *
 * Desde puppeteer 23, `executablePath()` devuelve una **promesa**, no una ruta.
 * `existsSync` de una promesa no revienta: devuelve `false`. Así que esa rama
 * —la que dice «usa el Chromium que trae el proyecto»— dejó de tomarse nunca,
 * en silencio, y la resolución siempre cae a la lista de rutas conocidas. En un
 * Windows con Chrome instalado el PDF sigue saliendo, con el Chrome del
 * escritorio en vez del Chromium del proyecto; en un servidor sin ninguno de
 * los dos, sale igual, porque al final se devuelve `undefined`. Por eso nadie
 * lo vio: la pieza buena existía y el camino real no la usaba.
 *
 * Y no lo vio tampoco la prueba, porque la prueba del PDF acepta las dos ramas
 * —sale un PDF, o sale una negativa que explica cómo imprimirlo— y bajo jest
 * siempre toma la segunda: puppeteer 25 es sólo ESM y `require` de un módulo
 * ESM, que node resuelve bien, el transformador de jest lo rompe con
 * «Unexpected token 'export'». Una prueba que pasa por la rama de error en cada
 * corrida no está comprobando el PDF: está comprobando el mensaje de disculpa.
 *
 * Aquí la resolución es una función pura que recibe el módulo. Así se puede
 * comprobar con un doble que devuelve una promesa —el caso real— y con uno que
 * devuelve una cadena —las versiones viejas—, sin navegador y sin jest de por
 * medio. Lo de punta a punta lo hace `npm run documentacion:pdf`, que corre en
 * node de verdad.
 * ============================================================================
 */

/** Lo poco que se le pide al módulo de puppeteer para elegir navegador. */
export interface ModuloConNavegador {
  executablePath?: unknown;
}

/** Las rutas donde suele estar un Chrome o un Edge ya instalado. */
export const RUTAS_CONOCIDAS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/**
 * Resuelve la ruta del navegador, o `undefined` para que puppeteer use el suyo.
 *
 * El orden es el de siempre, y ahora se cumple de verdad:
 *
 *   1. `DOCUMENTACION_NAVEGADOR`, si alguien quiere mandar sobre esto.
 *   2. `PUPPETEER_EXECUTABLE_PATH`, la variable que ya entiende puppeteer.
 *   3. El Chromium del propio puppeteer, si está descargado.
 *   4. Un Chrome o un Edge de los habituales.
 *   5. Nada: que lo intente puppeteer con lo que traiga.
 *
 * @param modulo  El módulo de puppeteer, o `null` si no se pudo cargar.
 * @param entorno Las variables de entorno (se inyectan para poder probarlas).
 * @param existe  Comprobador de existencia (se inyecta por lo mismo).
 */
export async function elegirNavegador(
  modulo: ModuloConNavegador | null,
  entorno: NodeJS.ProcessEnv = process.env,
  existe: (ruta: string) => boolean = existsSync,
): Promise<string | undefined> {
  const declarado =
    entorno.DOCUMENTACION_NAVEGADOR?.trim() ||
    entorno.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (declarado) return declarado;

  /*
   * `executablePath()` devuelve una promesa en puppeteer moderno y una cadena
   * en el viejo. `await` sirve para los dos, y por eso no se pregunta cuál es:
   * preguntar la versión es atarse a ella.
   */
  if (modulo && typeof modulo.executablePath === 'function') {
    try {
      const ruta = await (modulo.executablePath as () => unknown)();
      if (typeof ruta === 'string' && ruta && existe(ruta)) return undefined;
    } catch {
      /* no está descargado: se sigue con las rutas conocidas */
    }
  }

  return RUTAS_CONOCIDAS.find((c) => existe(c));
}

/** Carga puppeteer sin que un fallo de carga tumbe la resolución. */
export function cargarPuppeteer(): ModuloConNavegador | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('puppeteer') as ModuloConNavegador;
  } catch {
    return null;
  }
}
