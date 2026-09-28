import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una llamada sin nadie al otro lado
 * ----------------------------------------------------------------------------
 * Una pantalla que le pregunta al servidor por una ruta que no existe no falla
 * a medias: falla siempre, con cualquier rol, y se ve como una pantalla vacía o
 * como «no se pudo cargar». Una letra de más en la URL basta, y no hay
 * compilador que lo vea: la ruta es una cadena de texto a los dos lados.
 *
 * `coherencia.spec` ya cuidaba las acciones declaradas en el menú
 * —`accion: { metodo, ruta }`—, que nacieron de un defecto de esta familia.
 * Esto cubre lo demás: **todas** las llamadas de todas las pantallas, que son
 * unas diez veces más.
 *
 * Se callan los casos en los que no se puede afirmar nada: una URL que no
 * empieza por `/` (viene en una variable), y la parte interpolada, que casa con
 * cualquier valor porque es un parámetro. Lo que se comprueba es la FORMA de la
 * ruta, que es lo único que se sabe sin ejecutar.
 *
 * Medida el 28-sep-2026: 255 llamadas, todas con alguien al otro lado.
 * ============================================================================
 */

const BACK = join(__dirname, '..');
const RAIZ = join(BACK, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function fuentes(dir: string, acepta: (n: string) => boolean, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acepta, acc);
    else if (acepta(nombre)) acc.push(ruta);
  }
  return acc;
}

type Ruta = { metodo: string; patron: string };

function rutasDelBackend(): Ruta[] {
  const rutas: Ruta[] = [];
  for (const archivo of fuentes(BACK, (n) => n.endsWith('.controller.ts'))) {
    const texto = readFileSync(archivo, 'utf8');
    const prefijo = texto.match(/@Controller\(\s*'([^']*)'/)?.[1] ?? '';
    for (const m of texto.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      rutas.push({
        metodo: m[1].toUpperCase(),
        patron: `/${[prefijo, m[2] ?? ''].filter(Boolean).join('/')}`.replace(/\/+/g, '/'),
      });
    }
  }
  return rutas;
}

describe('una llamada sin nadie al otro lado', () => {
  if (!FRONTEND) {
    it('se salta: el frontend no está junto al backend', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const rutas = rutasDelBackend();
  const huerfanas: string[] = [];
  let revisadas = 0;

  for (const archivo of [
    ...fuentes(join(FRONTEND, 'app'), (n) => /\.tsx?$/.test(n)),
    ...fuentes(join(FRONTEND, 'components'), (n) => /\.tsx?$/.test(n)),
  ]) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(
      /api\.(get|post|patch|put|delete)\s*<?[^(]*\(\s*(["'`])([^"'`]*)\2/g,
    )) {
      const metodo = m[1].toUpperCase();
      let url = m[3];
      // Una URL que no empieza por `/` se arma en otra parte: no se afirma nada.
      if (!url.startsWith('/')) continue;
      /*
       * Una interpolación pegada al final SIN barra delante suele ser la cadena
       * de consulta —`/integracion/avisos${q}`—, no un tramo más de la ruta.
       * Tratarla como tramo producía el único falso positivo de este barrido.
       */
      url = url.replace(/(?<!\/)\$\{[^}]*\}$/, '');
      url = url.split('?')[0];
      if (!url) continue;

      revisadas += 1;
      const partes = url.replace(/\$\{[^}]*\}/g, '*').split('/').filter(Boolean);
      const hay = rutas.some((r) => {
        if (r.metodo !== metodo) return false;
        const suyas = r.patron.split('/').filter(Boolean);
        if (suyas.length !== partes.length) return false;
        return suyas.every((s, i) => s.startsWith(':') || s === partes[i] || partes[i] === '*');
      });
      if (!hay) {
        huerfanas.push(`${archivo.slice(FRONTEND.length + 1)} · ${metodo} ${url}`);
      }
    }
  }

  it('encuentra llamadas y rutas que cruzar (si no, la prueba no prueba nada)', () => {
    expect(rutas.length).toBeGreaterThanOrEqual(300);
    expect(revisadas).toBeGreaterThanOrEqual(200);
  });

  it('toda llamada de una pantalla tiene un endpoint que la atienda', () => {
    expect([...new Set(huerfanas)].sort()).toEqual([]);
  });
});
