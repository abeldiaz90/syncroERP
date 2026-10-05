import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * El ERP no arranca si Google no contesta
 * ----------------------------------------------------------------------------
 * MEDIDO EL 29-SEP-2026, en la máquina de desarrollo, con el ERP levantándose
 *
 * `app/layout.tsx` decía:
 *
 *     import { Inter } from 'next/font/google';
 *
 * Esa línea parece una decisión de diseño y es una dependencia de red en el
 * arranque. `next/font/google` descarga la tipografía desde fonts.gstatic.com
 * en tiempo de COMPILACIÓN. Cuando la descarga no sale —sin internet, detrás
 * de un proxy, con el firewall del cliente— Turbopack igual escribe el CSS,
 * con una url que no resuelve, y lo que aparece en el navegador no es un ERP
 * con otra letra: es la pantalla de error de Next en lugar del ERP.
 *
 *     Module not found: Can't resolve
 *     '@vercel/turbopack-next/internal/font/google/font'
 *     ./app/layout.tsx
 *
 * Y es intermitente, que es lo peor que puede ser: el mismo código compiló
 * 133 páginas esa misma tarde. Depende de si Google contestó.
 *
 * Esto importa más aquí que en una web cualquiera. SyncroERP se instala en el
 * servidor del cliente. Un servidor de una empresa mediana puede no tener
 * salida a internet por política, y entonces el ERP no levanta —no «se ve
 * distinto»: NO LEVANTA— por una tipografía.
 *
 * QUÉ SE HIZO
 *
 * La fuente vive en el repositorio: `app/fuentes/inter-latina-variable.woff2`,
 * el archivo variable del subconjunto latino de Inter. 48 KB, eje de peso
 * 100–900, así que los cuatro pesos que se declaraban (400, 500, 600, 700)
 * salen de un solo archivo en vez de cuatro descargas. Se verificó que trae
 * todo lo que el español necesita: á é í ó ú, ñ, Ñ, ü, ¿, ¡, €, ° y «».
 *
 * LA REGLA: nada que haga falta para que el ERP ARRANQUE se descarga de un
 * tercero al compilar. Si se necesita, se versiona.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/**
 * Quita comentarios antes de medir. Sin esto, la propia cabecera de
 * `layout.tsx` —que CITA la línea vieja para explicar por qué se quitó— hace
 * fallar la prueba. Una prueba que mide los comentarios no mide el código.
 */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function fuentes(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre === '.git') {
      continue;
    }
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acumulado);
    else if (/\.(tsx?|jsx?|mjs)$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

describe('Arranque · la tipografía no se le pide a Google al compilar', () => {
  it('encuentra el frontend', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('ningún archivo importa `next/font/google`', () => {
    const culpables: string[] = [];
    for (const ruta of fuentes(FRONTEND as string)) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
      if (/from\s+['"]next\/font\/google['"]/.test(codigo)) {
        culpables.push(ruta.slice((FRONTEND as string).length + 1).replace(/\\/g, '/'));
      }
    }

    expect(culpables.sort()).toEqual([]);
  });

  it('la raíz declara la fuente como local', () => {
    const layout = sinComentarios(
      readFileSync(join(FRONTEND as string, 'app/layout.tsx'), 'utf8'),
    );

    expect(layout).toMatch(/from\s+['"]next\/font\/local['"]/);
  });

  it('y el archivo que declara existe de verdad en el repositorio', () => {
    /*
     * Sin esto, la regla anterior se cumple con una ruta rota y el fallo
     * vuelve a aparecer en el arranque, que es donde no se quiere.
     */
    const layout = sinComentarios(
      readFileSync(join(FRONTEND as string, 'app/layout.tsx'), 'utf8'),
    );
    const declarada = /src:\s*['"](\.[^'"]+)['"]/.exec(layout);

    expect(declarada).not.toBeNull();

    const archivo = join(FRONTEND as string, 'app', (declarada as RegExpExecArray)[1]);
    expect(existsSync(archivo)).toBe(true);
    // Una fuente vacía o un marcador de Git LFS pasarían el `existsSync`.
    expect(statSync(archivo).size).toBeGreaterThan(10_000);
  });
});
