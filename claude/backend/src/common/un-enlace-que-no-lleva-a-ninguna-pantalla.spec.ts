import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un enlace que no lleva a ninguna pantalla
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La carga masiva de stock inicial tenía arriba una flecha de volver:
 * «← Inventario», a `/dashboard/inventario`. **Esa pantalla no existe.** Bajo
 * esa ruta sólo hay carpetas —recepciones, transferencias, conteos,
 * ubicaciones, ajustes— y ninguna `page.tsx`. La flecha daba un 404.
 *
 * Y lo daba en una de las primerísimas pantallas que toca una empresa nueva: la
 * carga inicial de existencias. El primer día, el primer clic de vuelta, un
 * error del navegador.
 *
 * Es la familia «un botón que lleva a una negativa», en su forma más tonta y
 * más barata de evitar: el botón no lleva a ningún sitio en absoluto. Nadie lo
 * vio porque quien programa la pantalla llega a ella por la URL directa, no por
 * el menú, y nunca pulsa la flecha de volver.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que todo `href` y todo `router.push` hacia `/dashboard/...` que esté escrito
 * como literal en el código termine en una pantalla que existe. Las rutas
 * dinámicas (`[id]`) cuentan como existentes, y los tramos interpolados
 * (`${x}`) casan con cualquier valor: lo que se comprueba es la FORMA de la
 * ruta, que es lo único que se puede saber sin ejecutar nada.
 *
 * No mira los destinos que se arman en tiempo de ejecución —los que vienen del
 * servidor, como los requisitos del centro de configuración—. Ésos no se pueden
 * comprobar aquí y decirlo es más honesto que fingir que sí.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

function fuentes(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (/\.tsx?$/.test(nombre)) acc.push(ruta);
  }
  return acc;
}

describe('un enlace que no lleva a ninguna pantalla', () => {
  if (!FRONTEND) {
    it('se salta: el frontend no está junto al backend', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const APP = join(FRONTEND, 'app');

  /** Las rutas que EXISTEN: una por cada `page.tsx`. */
  const pantallas = new Set<string>();
  for (const archivo of fuentes(APP)) {
    if (!/[\\/]page\.tsx?$/.test(archivo)) continue;
    const ruta = archivo
      .slice(APP.length)
      .replace(/\\/g, '/')
      .replace(/\/page\.tsx?$/, '')
      .split('/')
      // Los grupos de rutas de Next —(carpeta)— no aparecen en la URL.
      .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
      .join('/');
    pantallas.add(ruta || '/');
  }

  /** ¿Existe una pantalla con esta forma? */
  function existePantalla(destino: string): boolean {
    const partes = destino.split('/').filter(Boolean);
    for (const pantalla of pantallas) {
      const suyas = pantalla.split('/').filter(Boolean);
      if (suyas.length !== partes.length) continue;
      const casa = suyas.every((segmento, i) => {
        if (segmento.startsWith('[')) return true;
        if (!partes[i].includes('*')) return segmento === partes[i];
        /*
         * Un tramo con interpolación puede ser el tramo entero (`${id}`) o
         * parte de él (`wizard-${modulo}`). Se compara como patrón, porque
         * tratar el segundo caso como comodín entero dio un falso positivo:
         * los cinco `wizard-…` existen todos.
         */
        const patron = new RegExp(
          `^${partes[i].split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}$`,
        );
        return patron.test(segmento);
      });
      if (casa) return true;
    }
    return false;
  }

  const rotos: string[] = [];
  let revisados = 0;
  for (const archivo of [...fuentes(APP), ...fuentes(join(FRONTEND, 'components'))]) {
    const texto = readFileSync(archivo, 'utf8');
    const re = /(?:router\.(?:push|replace)\(\s*|href=\{?\s*)(["'`])(\/dashboard[^"'`\s)]*)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const destino = m[2]
        .split('?')[0]
        .split('#')[0]
        .replace(/\/$/, '')
        .replace(/\$\{[^}]*\}/g, '*');
      revisados += 1;
      if (!existePantalla(destino)) {
        rotos.push(`${archivo.slice(FRONTEND.length + 1)} → ${destino}`);
      }
    }
  }

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Y LAS QUE MANDA EL SERVIDOR
   *
   * La primera versión de esta prueba sólo miraba el frontend y decía, con
   * razón, que los destinos armados en tiempo de ejecución no se podían
   * comprobar. Se podían: no desde el frontend, pero sí desde aquí, porque es
   * el backend quien los escribe. El centro de configuración pinta botones con
   * la ruta que le llega en cada hallazgo, y uno de ellos —«Reservas o bloqueos
   * mayores a la existencia», de severidad ERROR— mandaba a
   * `/dashboard/inventario`, que no existe. Un 404 justo cuando hay algo que
   * arreglar.
   *
   * Se miran sólo las rutas escritas como cadena; las que se arman con plantilla
   * (`/dashboard/${modulo}`) no se pueden saber sin ejecutar, y se dice en vez
   * de fingir.
   * ──────────────────────────────────────────────────────────────────────────
   */
  const BACK = join(__dirname, '..');
  const rotasDelServidor: string[] = [];
  let revisadasDelServidor = 0;
  for (const archivo of fuentes(BACK)) {
    if (archivo.endsWith('.spec.ts') || archivo.includes(`${'commands'}`)) continue;
    const texto = readFileSync(archivo, 'utf8')
      // Un comentario que EXPLICA una ruta rota no es una ruta rota. Ya pasó:
      // `endpoints-navegables.ts` cuenta en su cabecera cuáles inventaba antes.
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    for (const m of texto.matchAll(/['"`](\/dashboard\/[A-Za-z0-9\-/_]*)['"`]/g)) {
      const destino = m[1].replace(/\/$/, '');
      /*
       * Las bases de agrupación de `permisos-dinamicos` no son destinos: sólo
       * dicen a qué módulo pertenece un permiso, y ninguna pantalla las usa
       * como enlace. Se reconocen por el nombre del campo.
       */
      const alrededor = texto.slice(Math.max(0, m.index! - 40), m.index!);
      if (/rutaFrontendBase\s*:\s*$/.test(alrededor)) continue;
      revisadasDelServidor += 1;
      if (!existePantalla(destino)) {
        rotasDelServidor.push(`${archivo.slice(BACK.length + 1)} → ${destino}`);
      }
    }
  }

  it('encuentra pantallas y enlaces que revisar', () => {
    // Si el reconocimiento se rompe, esto se volvería verde por vacío.
    expect(pantallas.size).toBeGreaterThanOrEqual(100);
    expect(revisados).toBeGreaterThanOrEqual(100);
  });

  it('ningún enlace del panel apunta a una pantalla que no existe', () => {
    expect([...new Set(rotos)]).toEqual([]);
  });

  it('ninguna ruta que manda el servidor apunta a una pantalla que no existe', () => {
    expect(revisadasDelServidor).toBeGreaterThanOrEqual(50);
    expect([...new Set(rotasDelServidor)]).toEqual([]);
  });
});
