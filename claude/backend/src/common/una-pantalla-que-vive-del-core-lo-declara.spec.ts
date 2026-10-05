import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, sep } from 'path';

/**
 * ============================================================================
 * Una pantalla que vive del core lo declara
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * SyncroERP se entrega en tres formas: sólo ERP, sólo el core financiero, y
 * los dos juntos. Lo que decide qué ve cada empresa es `requiereCore` en el
 * mapa de navegación, y la regla la aplica `contratado()` en las puertas: el
 * menú lateral, el centro de trabajo y las pestañas de permisos.
 *
 * El mecanismo se construyó cuando había DOS pantallas que dependían del core.
 * Después llegaron el espejo contable, el buzón de avisos, la correspondencia
 * de roles, la verificación de crédito… y `requiereCore` siguió declarado en
 * tres items. Una pantalla nueva que vive entera del core nace, por omisión,
 * ofrecida a todo el mundo: a una empresa que sólo usa el ERP se le enseña la
 * puerta de un módulo que no compró, y quien entra recibe ceros o un buzón
 * vacío con aire de estar bien.
 *
 * Nadie lo ve al escribir la pantalla, porque en el entorno de desarrollo el
 * core está encendido y todo aparece.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que toda página cuyos datos salen ÚNICAMENTE de `/integracion` tenga puerta:
 * o su item del mapa de módulos declara `requiereCore`, o un `layout.tsx` por
 * encima de ella filtra con `contratado(`.
 *
 * El criterio es deliberadamente estrecho —«todas sus llamadas son al core»—
 * para no gritar en falso. Una pantalla que mezcla datos del ERP con datos del
 * core sigue teniendo sentido sin core (degradada, como el expediente del
 * cliente) y decidir eso a mano es correcto. La que no tiene ni una sola
 * llamada propia, no.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** `api.get('/x')`, `api.post<T>('/x')`, y el `fetch(`${api}/x`)` a pelo. */
const LLAMADA =
  /api\.(?:get|post|patch|put|delete)\s*(?:<[^>()]*>)?\s*\(\s*[`'"]([^`'"]+)|fetch\(\s*`\$\{[^}]+\}([^`'"]+)/g;

function paginas(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) paginas(ruta, acumulado);
    else if (nombre === 'page.tsx') acumulado.push(ruta);
  }
  return acumulado;
}

/** `/dashboard/creditos/avisos` a partir del archivo. */
function rutaDe(archivo: string): string {
  const segmentos = relative(FRONTEND!, archivo)
    .replace(/page\.tsx$/, '')
    .split(sep)
    .filter(Boolean);
  // `app` es la carpeta del router, no un segmento de la ruta.
  if (segmentos[0] === 'app') segmentos.shift();
  return '/' + segmentos.join('/');
}

/** ¿Algún `layout.tsx` por encima de esta página pregunta por la contratación? */
function layoutQuePregunta(archivo: string): string | null {
  let dir = dirname(archivo);
  /*
   * El tope es `app/dashboard`, EXCLUIDO. Su layout también llama a
   * `contratado()` —es el menú lateral— y contarlo daba por cubierta cualquier
   * pantalla del dashboard, que es justo lo contrario de lo que se busca: el
   * menú es la puerta que se esconde, no el guardia de la pantalla. La primera
   * versión de esta prueba pasaba en verde por eso, incluso quitándole a mano
   * el `requiereCore` al espejo contable.
   */
  const tope = join(FRONTEND!, 'app', 'dashboard');
  while (dir !== tope && dir.length > tope.length) {
    const layout = join(dir, 'layout.tsx');
    if (existsSync(layout)) {
      const texto = readFileSync(layout, 'utf8');
      if (/contratado\s*\(/.test(texto)) return layout;
    }
    dir = dirname(dir);
  }
  return null;
}

describe('una pantalla que vive del core lo declara', () => {
  if (!FRONTEND) {
    it('se salta: el frontend no está junto al backend', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const mapa = readFileSync(
    join(FRONTEND, 'app/dashboard/module-config.ts'),
    'utf8',
  );

  /**
   * ¿El item de esta ruta en el mapa de módulos declara `requiereCore`?
   *
   * Se busca el `href` y se mira el resto de SU objeto —hasta la llave que lo
   * cierra—, no el archivo entero: `requiereCore` aparece en otros items y
   * buscarlo en todo el texto daría verde a cualquiera.
   */
  function declaraEnElMapa(ruta: string): boolean {
    const i = mapa.indexOf(`"${ruta}"`);
    if (i < 0) return false;
    const fin = mapa.indexOf('\n      },', i);
    const objeto = mapa.slice(i, fin < 0 ? mapa.length : fin);
    return /requiereCore\s*:/.test(objeto);
  }

  const delCore = paginas(join(FRONTEND, 'app/dashboard')).filter((archivo) => {
    const texto = readFileSync(archivo, 'utf8');
    const rutas = [...texto.matchAll(LLAMADA)].map((m) => m[1] ?? m[2]);
    if (!rutas.length) return false;
    return rutas.every((r) => r.startsWith('/integracion'));
  });

  it('hay pantallas que viven del core (si no, la prueba no prueba nada)', () => {
    expect(delCore.length).toBeGreaterThan(0);
  });

  it.each(delCore.map((a) => [rutaDe(a), a]))(
    '%s tiene puerta',
    (ruta, archivo) => {
      const enMapa = declaraEnElMapa(ruta as string);
      const enLayout = layoutQuePregunta(archivo as string);
      if (!enMapa && !enLayout) {
        throw new Error(
          `${ruta} sólo pide datos a /integracion y nada decide si esta ` +
            `empresa lo tiene contratado. Declara requiereCore en su item de ` +
            `app/dashboard/module-config.ts (el eje: cartera, contabilidad, ` +
            `validacion o cualquiera), o filtra con contratado() en un ` +
            `layout.tsx por encima de ella.`,
        );
      }
    },
  );
});
