import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

import { ENDPOINTS_NAVEGABLES } from '../iam/data/endpoints-navegables';

/**
 * ============================================================================
 * Ninguna pantalla queda fuera del perfil de todos
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El ticket de una venta —`/dashboard/ventas/<id>/ticket`, la pantalla a la
 * que el punto de venta redirige en cuanto se cobra— decía «Esta sección no
 * está en tu perfil» a todo el mundo. A todo el mundo menos al administrador,
 * que lleva `*` y nunca se entera de nada.
 *
 * El backend contestaba 200 a `GET /ventas/<id>` para los diez roles. La
 * prueba de permisos decía que estaba bien. Y estaba bien: el 200 era cierto.
 * Lo que ninguna prueba miraba es que el permiso de PANTALLA es una tercera
 * capa, distinta de la tabla de permisos y de los `@Roles()`, y que se arma
 * con las `rutaFrontend` de los endpoints navegables. `GET /ventas` declara
 * `/dashboard/ventas/historial`. El ticket cuelga de `/dashboard/ventas/<id>`,
 * que es HERMANO del historial, no hijo. Ningún permiso lo cubría.
 *
 * Es el mismo defecto que ya arreglamos una vez con otro nombre —el decorador
 * promete lo que el permiso niega—, sólo que del otro lado: aquí el permiso
 * concede y la pantalla igual no abre. Una venta se podía cobrar y no se podía
 * imprimir.
 *
 * POR QUÉ NO LO VIO NADIE
 *
 * Porque probar por API con el token de cada rol no toca esta capa. La
 * respuesta HTTP es correcta; la puerta está antes, en el navegador. Las 1,800
 * llamadas que dimos por buenas nunca pasaron por `puedeEntrar()`.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que cada `page.tsx` bajo `app/dashboard` y `app/pos` esté cubierta por algo:
 * una ruta navegable, la rama de centros de trabajo, las portadas de módulo o
 * las rutas libres. Las pantallas con parámetro —doce— son las que se caen por
 * este agujero, porque su ruta nunca es igual a la que declara el endpoint.
 *
 * La prueba reproduce `cubre()` del frontend a propósito, segmento a segmento
 * y con los `:parametro` como comodín. Si alguien cambia una de las dos, esta
 * prueba se entera.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

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

/** `app/dashboard/ventas/[id]/ticket/page.tsx` → `/dashboard/ventas/:id/ticket` */
function rutaDe(archivo: string): string {
  return (
    '/' +
    relative(FRONTEND!, archivo)
      .split(sep)
      .join('/')
      .replace(/^app\//, '')
      .replace(/\/page\.tsx$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1')
  );
}

/**
 * La misma regla que `lib/session.ts`: el permiso cubre su ruta y todo lo que
 * cuelga de ella, comparando SEGMENTOS, y un segmento `:algo` acepta
 * cualquiera. Comparar cadenas —como hacía antes— nunca podía cubrir una
 * pantalla con identificador dentro.
 */
function cubre(permiso: string, ruta: string): boolean {
  if (permiso === '*') return true;
  const p = permiso.replace(/\/+$/, '').split('/');
  const r = ruta.replace(/\/+$/, '').split('/');
  if (r.length < p.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === r[i]);
}

describe('Coherencia · ninguna pantalla queda fuera del perfil de todos', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const declaradas = Object.values(ENDPOINTS_NAVEGABLES).flatMap((m) => [
    m.rutaFrontend,
    ...(m.rutasAdicionales ?? []),
  ]);

  /* Las que no piden permiso a nadie o las resuelve otra rama del layout. */
  const layout = readFileSync(join(FRONTEND, 'app/dashboard/layout.tsx'), 'utf8');
  const config = readFileSync(
    join(FRONTEND, 'app/dashboard/module-config.ts'),
    'utf8',
  );
  /*
   * Se leen las rutas ENTRECOMILLADAS, no lo que hay entre comas: un
   * comentario con una coma dentro —el que explica por qué la portada de
   * hotelería es contenedor— partía la lista y se perdía justo la entrada que
   * venía detrás. Una prueba que se pierde una entrada dice que falta algo que
   * sí está.
   */
  const entradas = (texto: string, marca: RegExp) =>
    [...texto.replace(/\/\/[^\n]*/g, '').matchAll(marca)].flatMap((m) =>
      [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((c) => c[1]),
    );

  const libres = new Set([
    ...entradas(layout, /RUTAS_LIBRES = new Set\(\[([^\]]*)\]/g),
    ...entradas(config, /RUTAS_CONTENEDOR = new Set<string>\(\[([^\]]*)\]/g),
  ]);
  /* Los centros de trabajo los resuelve su propia rama en el layout. */
  libres.add('/dashboard/centros/:modulo');

  const todas = [
    ...paginas(join(FRONTEND, 'app/dashboard')),
    ...paginas(join(FRONTEND, 'app/pos')),
  ].map(rutaDe);

  it('toda pantalla la cubre algún permiso', () => {
    const huerfanas = todas.filter(
      (ruta) =>
        !libres.has(ruta) && !declaradas.some((p) => cubre(p, ruta)),
    );
    expect(huerfanas).toEqual([]);
  });

  it('las pantallas con parámetro en la ruta también', () => {
    const conParametro = todas.filter((r) => r.includes('/:'));
    /* Que no se vacíe el universo de la prueba anterior sin que nadie lo note. */
    expect(conParametro.length).toBeGreaterThanOrEqual(10);
    const huerfanas = conParametro.filter(
      (ruta) => !libres.has(ruta) && !declaradas.some((p) => cubre(p, ruta)),
    );
    expect(huerfanas).toEqual([]);
  });

  /*
   * Y que el frontend siga comparando segmentos. Si alguien vuelve a
   * `startsWith`, las rutas con `:parametro` que declaramos aquí dejan de
   * cubrir nada y la pantalla se cierra otra vez sin que ninguna prueba grite.
   */
  it('el frontend compara segmentos y acepta :parametro como comodín', () => {
    const sesion = readFileSync(join(FRONTEND, 'lib/session.ts'), 'utf8');
    const fn = sesion.slice(sesion.indexOf('export function cubre'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}'));
    expect(cuerpo).toContain("split('/')");
    expect(cuerpo).toContain("startsWith(':')");
  });
});
