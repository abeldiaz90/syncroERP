import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * UN BOTÓN QUE NO DICE QUÉ HACE
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * Probando el alta de inventario en la pantalla de productos no pude distinguir
 * el icono de entrada del de salida. El árbol de accesibilidad devolvía
 * `button "(no name)"` para los cinco iconos de cada renglón, y hubo que ir al
 * código a ver cuál era cuál.
 *
 * Lo que a una herramienta con el árbol entero le resulta imposible, a un lector
 * de pantalla también; y a un almacenista nuevo frente a cinco iconos grises le
 * queda una sola salida: hacer clic a ver qué pasa. En una pantalla donde dos de
 * esos botones mueven existencias y dinero.
 *
 * LA MEDICIÓN
 *
 * 166 botones de sólo icono en el ERP. **95 sin nombre accesible.** En el portal
 * Fineract, cero: ahí los botones llevan texto o etiqueta. Era un problema de un
 * solo lado.
 *
 * Se etiquetaron los 95: los seis pantallas más usadas con texto específico
 * —«Entrada sin documento», «Quitar el artículo del ticket», «Usar como imagen
 * principal»— y el resto con el texto exacto de su icono, que es verdad y es
 * infinitamente mejor que nada.
 *
 * `aria-label` Y `title`, las dos: `title` pinta el globo al pasar el ratón y
 * ayuda a cualquiera; `aria-label` es lo que lee la tecnología de apoyo. Una
 * sola de las dos deja fuera a la mitad.
 *
 * POR QUÉ ESTA PRUEBA Y NO SÓLO EL ARREGLO
 *
 * 95 botones no llegaron ahí de golpe: llegaron de uno en uno, copiando el
 * vecino. Arreglarlos sin vigilar el patrón es volver a tenerlos en unos meses.
 * Esto es un trinquete: el número sólo puede bajar.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** El `>` que cierra la etiqueta de apertura, sin confundirse con `=>`. */
function finDeApertura(s: string, i: number): number {
  let j = i;
  for (;;) {
    j = s.indexOf('>', j + 1);
    if (j < 0) return -1;
    if (s[j - 1] !== '=') return j;
  }
}

/**
 * Sin tags, no queda ni texto ni una expresión.
 *
 * Lo segundo importa y costó una medición equivocada: `{m.label}` o
 * `{cargando ? 'Creando…' : 'Crear'}` SÍ pintan texto. Contarlos como botones
 * mudos inflaba el número en una quinta parte. Un `{` en el contenido significa
 * que algo se pinta ahí, y no se puede saber qué sin ejecutar: se da por bueno.
 */
function esSoloIcono(contenido: string): boolean {
  const resto = contenido.replace(/<[^>]*>/g, '').trim();
  return resto === '' && contenido.includes('<');
}

function archivosTsx(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosTsx(ruta, acumulado);
    else if (nombre.endsWith('.tsx')) acumulado.push(ruta);
  }
  return acumulado;
}

function mudos(raiz: string): string[] {
  const fuera: string[] = [];
  for (const ruta of archivosTsx(raiz)) {
    const s = readFileSync(ruta, 'utf8');
    let i = 0;
    for (;;) {
      i = s.indexOf('<button', i);
      if (i < 0) break;
      const j = finDeApertura(s, i);
      if (j < 0) break;
      const k = s.indexOf('</button>', j);
      if (k < 0) break;
      const apertura = s.slice(i, j + 1);
      const contenido = s.slice(j + 1, k);
      if (
        esSoloIcono(contenido) &&
        !apertura.includes('aria-label') &&
        !apertura.includes('title=')
      ) {
        fuera.push(`${ruta.replace(raiz, '')}:${s.slice(0, i).split('\n').length}`);
      }
      i = k;
    }
  }
  return fuera;
}

describe('ningún botón de sólo icono se queda sin decir qué hace', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    /*
     * El mismo guardián que `el-arbol-que-miraban-las-pruebas.spec.ts`: una
     * prueba que no encuentra qué medir y se declara satisfecha es una luz
     * verde sin nada detrás.
     */
    expect(FRONTEND).toBeDefined();
  });

  it('ni uno solo en toda la aplicación', () => {
    /*
     * El trinquete. Si mañana alguien añade un `<button>` con un icono dentro y
     * nada más, esto se pone rojo con su archivo y su línea, y cuesta diez
     * segundos arreglarlo. Es más barato aquí que en una capacitación.
     */
    expect(mudos(join(FRONTEND!, 'app'))).toEqual([]);
  });

  it('los dos botones que mueven existencias dicen exactamente qué mueven', () => {
    /*
     * Éstos son los que lo destaparon, y los que más importan: uno sube las
     * existencias y el valor del almacén, el otro los baja, y los dos generan
     * póliza. «Botón» no habría servido de nada.
     */
    const productos = readFileSync(
      join(FRONTEND!, 'app/dashboard/productos/page.tsx'),
      'utf8',
    );
    expect(productos).toMatch(
      /tipo: 'compra'[\s\S]{0,40}aria-label="Entrada sin documento" title="Entrada sin documento"/,
    );
    expect(productos).toMatch(
      /tipo: 'salida'[\s\S]{0,40}aria-label="Salida sin documento" title="Salida sin documento"/,
    );
  });

  it('y llevan las dos cosas: el globo y la etiqueta', () => {
    /*
     * `title` pinta el globo al pasar el ratón —sirve a cualquiera que dude— y
     * `aria-label` es lo que lee la tecnología de apoyo. Poner sólo una deja
     * fuera a la mitad de la gente, y es el atajo evidente.
     */
    const sinGlobo: string[] = [];
    for (const ruta of archivosTsx(join(FRONTEND!, 'app'))) {
      const s = readFileSync(ruta, 'utf8');
      let i = 0;
      for (;;) {
        i = s.indexOf('<button', i);
        if (i < 0) break;
        const j = finDeApertura(s, i);
        if (j < 0) break;
        const k = s.indexOf('</button>', j);
        if (k < 0) break;
        const apertura = s.slice(i, j + 1);
        /*
         * Sólo los de sólo icono: un botón con texto visible ya se explica, y
         * ponerle globo encima sería ruido.
         */
        if (
          esSoloIcono(s.slice(j + 1, k)) &&
          apertura.includes('aria-label') &&
          !apertura.includes('title=')
        ) {
          sinGlobo.push(
            `${ruta.replace(FRONTEND!, '')}:${s.slice(0, i).split('\n').length}`,
          );
        }
        i = k;
      }
    }
    expect(sinGlobo).toEqual([]);
  });
});
