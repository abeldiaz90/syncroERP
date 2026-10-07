import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * UNA CABECERA QUE EL NAVEGADOR NUNCA LLEGÓ A MANDAR
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 6-oct, barriendo el aislamiento multiempresa. El servidor contesta a
 * `GET /iam/suplantacion`:
 *
 *     {"habilitada":true,"puedeSuplantar":true,"cabecera":"x-suplantar-usuario"}
 *
 * O sea: «sí, puedes ver el ERP como otra persona». Existe la pantalla
 * (`/dashboard/admin/ver-como`), existe el guardia que la vigila, existe el
 * helper que guarda a quién se está viendo, y `lib/api.ts` pone la cabecera en
 * **todas** las peticiones mientras esté puesta.
 *
 * Y no funcionaba. Ninguna petición llegaba al servidor.
 *
 * `enableCors` de este ERP declara `allowedHeaders` con una lista EXPLÍCITA, y
 * `X-Suplantar-Usuario` no estaba en ella. Una lista explícita es una lista
 * blanca: el navegador hace su verificación previa, ve que la cabecera no está
 * permitida y **cancela la petición antes de mandarla**. No hay 403 que leer,
 * no hay línea en la bitácora del servidor, no hay traza. Desde la pantalla se
 * ve el ERP entero roto; desde el servidor no pasó nada, porque de verdad no
 * pasó nada.
 *
 * Medido en vivo antes de arreglarlo, con una petición real desde el navegador
 * llevando la cabecera: `TypeError: Failed to fetch`. Con la cabecera quitada,
 * la misma petición: 200.
 *
 * POR QUÉ SOBREVIVIÓ A TODAS LAS PRUEBAS
 *
 * Porque las pruebas del guardia lo llaman directamente, sin navegador, y el
 * guardia está bien. El defecto no vivía en ninguno de los dos lados: vivía en
 * que las dos listas —la que el frontend manda y la que el backend permite— no
 * se habían mirado nunca juntas. Es la misma forma de «un control que se cree
 * puesto», aplicada a una función: una capacidad que se anuncia disponible y
 * que el único cliente que existe no puede ejercer.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 * No que esté `X-Suplantar-Usuario` —eso sería fijar el síntoma—. Lee las
 * cabeceras que el frontend pone DE VERDAD y exige que el backend las permita.
 * La próxima que alguien añada no puede morir en silencio igual que ésta.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['frontend', '../frontend', 'claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'lib/api.ts')));

const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');

/** Sin comentarios: aquí se mide código, no explicaciones. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** La lista blanca de `enableCors`, en minúsculas: CORS no distingue mayúsculas. */
function permitidas(): string[] {
  const m = sinComentarios(main).match(/allowedHeaders:\s*\[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1].toLowerCase());
}

describe('el backend permite las cabeceras que el frontend manda', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('la lista blanca existe y es explícita', () => {
    /*
     * Si algún día pasa a ser `*` esta prueba deja de tener sentido, y hay que
     * saberlo: un comodín permite todo, incluido lo que nadie revisó.
     */
    expect(permitidas().length).toBeGreaterThan(3);
  });

  it('cada cabecera que `lib/api.ts` pone está permitida', () => {
    const api = sinComentarios(readFileSync(join(FRONTEND!, 'lib/api.ts'), 'utf8'));

    /*
     * Dos formas de escribirla: literal (`'Content-Type': ...`) y por
     * constante (`[CABECERA_SUPLANTACION]: ...`). La segunda se resuelve
     * leyendo el valor de la constante en su propio archivo, porque es
     * justamente la forma que se nos escapó.
     */
    const literales = [...api.matchAll(/['"]([A-Za-z][A-Za-z0-9-]*-[A-Za-z0-9-]+)['"]\s*\]?\s*:/g)]
      .map((m) => m[1]);

    const porConstante = [...api.matchAll(/\[\s*([A-Z][A-Z0-9_]+)\s*\]\s*:/g)].map((m) => m[1]);
    const resueltas: string[] = [];
    for (const nombre of porConstante) {
      const importada = api.match(
        new RegExp(`import\\s*\\{[^}]*\\b${nombre}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`),
      );
      if (!importada) continue;
      const archivo = join(FRONTEND!, 'lib', `${importada[1].replace(/^\.\//, '')}.ts`);
      if (!existsSync(archivo)) continue;
      const valor = readFileSync(archivo, 'utf8').match(
        new RegExp(`${nombre}\\s*=\\s*['"]([^'"]+)['"]`),
      );
      if (valor) resueltas.push(valor[1]);
    }

    const mandadas = [...new Set([...literales, ...resueltas])].map((h) => h.toLowerCase());

    /* Que de verdad esté leyendo algo: una lista vacía pasaría en verde. */
    expect(mandadas.length).toBeGreaterThan(0);
    expect(resueltas.length).toBeGreaterThan(0);
    expect(mandadas).toContain('x-suplantar-usuario');

    const prohibidas = mandadas.filter((h) => !permitidas().includes(h));
    expect(prohibidas).toEqual([]);
  });

  it('la pantalla «Ver como» sigue existiendo, o esto no vigila nada', () => {
    /*
     * En negativo. Si alguien retira la función, esta prueba tiene que caer
     * con ella en vez de quedarse exigiendo una cabecera que ya nadie manda.
     */
    expect(existsSync(join(FRONTEND!, 'app/dashboard/admin/ver-como/page.tsx'))).toBe(true);
    expect(existsSync(join(FRONTEND!, 'lib/ver-como.ts'))).toBe(true);
  });
});
