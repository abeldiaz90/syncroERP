import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * ============================================================================
 * Un reporte que no se pudo consultar no es un reporte en cero
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La balanza de comprobación pedía sus datos así:
 *
 *   if (res.ok) setCuentas(await res.json());
 *
 * Sin `else`. Cualquier fallo —un 403, el backend reiniciándose dos segundos—
 * dejaba la lista vacía, y con la lista vacía los cargos y los abonos suman
 * cero, y cero es igual a cero, así que la pantalla anunciaba, en verde y con
 * palomita:
 *
 *   ✓ CUADRADA
 *
 * Es la peor forma posible de este defecto: el reporte que un contador abre
 * precisamente para comprobar que todo está bien le contesta que sí, justo
 * cuando no ha podido preguntarlo. Lo mismo en el balance general («Balance
 * cuadrado»), en el estado de resultados, en la declaración de IVA —la cifra
 * que se presenta ante el SAT—, en el libro diario («Sin pólizas en el
 * período»), en los saldos iniciales y en tres reportes de ventas.
 *
 * LA REGLA
 *
 * En una pantalla cuyo contenido son cifras, una consulta fallida se dice. No
 * se presenta como un periodo sin movimiento, que es la conclusión contraria.
 * Toda comprobación `if (algo.ok)` en finanzas y en reportes lleva su `else`.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que no vuelva a aparecer un `if (r.ok)` sin `else` en esas dos carpetas.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** Las carpetas donde todo lo que se enseña es una cifra. */
const CARPETAS_DE_CIFRAS = ['app/dashboard/finanzas', 'app/dashboard/reportes'];

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

describe('Reportes · un reporte que no se pudo consultar no es un reporte en cero', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const archivos = CARPETAS_DE_CIFRAS.flatMap((carpeta) =>
    fuentes(join(FRONTEND, carpeta)).map((ruta) => ({
      ruta: relative(FRONTEND, ruta).split(sep).join('/'),
      /*
       * Sin comentarios: en varias de estas pantallas la explicación del
       * defecto cita el código que lo causaba, y citarlo no es cometerlo.
       */
      texto: readFileSync(ruta, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, ''),
    })),
  );

  it('hay pantallas de cifras en el árbol (si no, esto no mide nada)', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('toda comprobación de respuesta lleva su rama de fallo', () => {
    const culpables: string[] = [];

    for (const { ruta, texto } of archivos) {
      for (const m of texto.matchAll(/if\s*\(\s*(\w+)\.ok\s*\)/g)) {
        /*
         * Lo que sigue al `if`: o un bloque `{…}` y después `else`, o una
         * sentencia de una línea y después `else`. Se mira una ventana corta.
         */
        const cola = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 500);
        if (/^\s*\{[\s\S]*?\}\s*else\b/.test(cola)) continue;
        if (/^[^\n]*\n\s*else\b/.test(cola)) continue;
        if (/^\s*\{[^{}]*\}\s*else\b/.test(cola)) continue;
        culpables.push(
          `${ruta}:${texto.slice(0, m.index).split('\n').length} → if (${m[1]}.ok) sin else`,
        );
      }
    }

    expect(culpables.sort()).toEqual([]);
  });
});
