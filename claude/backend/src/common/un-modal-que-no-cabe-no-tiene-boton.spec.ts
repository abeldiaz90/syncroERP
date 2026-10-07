/**
 * ============================================================================
 * Un modal que no cabe en la pantalla no tiene botones
 * ----------------------------------------------------------------------------
 * MEDIDO EN VIVO el 7-oct-2026, intentando dar de alta una segunda caja desde
 * «Crédito y cobranza → Cuentas bancarias» en una ventana de 543 px de alto —un
 * portátil normal—:
 *
 *   · La tarjeta del modal medía 716 px y llevaba `overflow-hidden`.
 *   · La capa de fondo era `fixed inset-0 … flex items-center`, sin scroll.
 *   · «Crear cuenta» quedaba en y=566–605: **fuera de la pantalla, recortado,
 *     y sin manera de llegar a él.** Ni con la rueda, ni con `scrollIntoView`.
 *
 * No es un detalle estético: la pantalla **no se podía usar**. El formulario se
 * llenaba entero y no había forma de enviarlo, y como `overflow-hidden` corta
 * sin dejar sombra, tampoco se veía que hubiera un botón más abajo. Se descubrió
 * porque hacía falta una segunda caja para probar el mostrador con dos cajeros;
 * hasta entonces nadie había abierto ese modal en una pantalla baja.
 *
 * El barrido encontró **33 modales iguales** en el ERP: catálogos, almacenes,
 * impuestos, departamentos, pago a proveedores, cobranza, hotelería, el propio
 * punto de venta y el diálogo de confirmación que usa media aplicación.
 *
 * LA CORRECCIÓN, una por capa de fondo: `overflow-y-auto` para que la página
 * del modal se pueda recorrer, `items-start` en vez de `items-center` —centrar
 * con `align-items` recorta por arriba lo que desborda, que es justo lo que no
 * se quiere— y `[&>*]:my-auto`, que centra con márgenes automáticos cuando hay
 * sitio y deja el modal arriba cuando no lo hay.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function pantallas(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) pantallas(ruta, acc);
    else if (nombre.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
}

/** Las capas de fondo que centran un modal. Devuelve [archivo, clases]. */
function capasQueCentran(archivos: string[]): [string, string][] {
  const salida: [string, string][] = [];
  for (const ruta of archivos) {
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/className=(?:"|\{`)([^"`]*fixed inset-0[^"`]*)(?:"|`\})/g)) {
      const clases = m[1];
      if (!/\bflex\b|\bgrid\b/.test(clases)) continue;
      if (!/items-center|place-items|justify-center/.test(clases)) continue;
      salida.push([ruta, clases]);
    }
  }
  return salida;
}

describe('Ningún modal esconde sus botones fuera de la pantalla', () => {
  const hay = Boolean(FRONTEND);

  it('el árbol que se mide es el que está vivo', () => {
    // Sin esto, un árbol que no se resuelve dejaría el barrido midiendo cero.
    expect(hay).toBe(true);
  });

  const archivos = hay ? pantallas(join(FRONTEND!, 'app')).concat(
    existsSync(join(FRONTEND!, 'components')) ? pantallas(join(FRONTEND!, 'components')) : [],
  ) : [];
  const capas = capasQueCentran(archivos);

  it('el barrido encuentra de verdad los modales', () => {
    /*
     * La prueba de la prueba. Si las clases de Tailwind cambian de forma, esto
     * se queda en cero y declararía limpio un árbol sin mirar.
     */
    expect(capas.length).toBeGreaterThanOrEqual(30);
  });

  it('todos tienen salida cuando el modal es más alto que la ventana', () => {
    const sinSalida = capas
      .filter(([ruta, clases]) => {
        // O la capa se puede recorrer…
        if (/overflow-y-auto|overflow-auto|overflow-y-scroll/.test(clases)) return false;
        // …o la tarjeta se limita a sí misma y recorre por dentro.
        const texto = readFileSync(ruta, 'utf8');
        const i = texto.indexOf(clases);
        return !/max-h-\[|max-h-screen|max-h-full/.test(texto.slice(i, i + 700));
      })
      .map(([ruta]) => relative(FRONTEND!, ruta).split(sep).join('/'));
    expect([...new Set(sinSalida)]).toEqual([]);
  });

  it('y la que se recorre no centra con `items-center`, que recorta por arriba', () => {
    /*
     * `align-items: center` dentro de un contenedor con scroll deja el principio
     * del contenido por encima del origen, y esa parte NO se puede alcanzar: el
     * encabezado del modal queda cortado para siempre. Con márgenes automáticos
     * se centra igual y el desbordamiento sí se recorre.
     */
    const recortan = capas
      .filter(([, clases]) => /overflow-y-auto|overflow-auto/.test(clases))
      .filter(([, clases]) => /\bitems-center\b/.test(clases))
      .map(([ruta]) => relative(FRONTEND!, ruta).split(sep).join('/'));
    expect([...new Set(recortan)]).toEqual([]);
  });
});
