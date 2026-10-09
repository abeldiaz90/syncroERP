import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una pantalla del core en una empresa que no tiene core
 * ----------------------------------------------------------------------------
 * LOS TRES MODOS, Y EL QUE SE ROMPE SOLO
 *
 * Esta implementación se vende de tres maneras:
 *
 *   · **Sólo ERP** — la empresa nace con los ejes apagados y ni se entera de
 *     que el core existe.
 *   · **ERP + core** — cartera y contabilidad viajan entre los dos.
 *   · **Sólo core** — no pasa por aquí: esa institución opera con las
 *     pantallas del portal y no es cliente del ERP. Ver
 *     `tres-modos-de-contratacion.spec.ts`, que lo fija.
 *
 * El que se rompe solo es el primero. El ERP tiene pantallas que **sólo**
 * tienen sentido con el core al lado —los avisos, el espejo contable, la
 * conciliación de cartera, el flujo de verificación—, y el mapa de módulos las
 * marca con `requiereCore` para que no aparezcan donde no hay core.
 *
 * Marcarlas es manual. Y lo manual se olvida: la pantalla siguiente que hable
 * con el core y nadie marque va a salir en el menú de una empresa de sólo ERP
 * y a contestar un error, o peor, un cero. Y no se va a descubrir aquí: se va a
 * descubrir en su instalación, donde nadie puede arreglarlo.
 *
 * QUÉ HACE ESTA PRUEBA
 *
 * Lee las pantallas, no una lista escrita a mano. Toda pantalla del tablero que
 * llame a `/integracion/...` —que es el prefijo por el que el ERP habla con el
 * core— tiene que estar marcada con `requiereCore`, o estar justificada aquí
 * una por una, con su motivo.
 *
 * El rumbo contrario no se exige: marcar de más esconde una pantalla que
 * funcionaría, lo cual es molesto pero no rompe nada. Marcar de menos la
 * ofrece y falla. Esta prueba vigila el lado que duele.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** El prefijo por el que el ERP habla con el registro externo. */
const PREFIJO_CORE = /['`]\/integracion\//;

/**
 * Pantallas que llaman al core y NO están en el mapa de módulos, con el motivo.
 *
 * Que estén aquí no es un permiso: es una afirmación comprobable. Cada una se
 * comprueba abajo, y una justificación que deje de ser cierta pone la prueba
 * en rojo igual que una pantalla sin marcar.
 */
const JUSTIFICADAS: Record<string, string> = {
  '/dashboard/creditos/verificacion/ejecutar':
    'Es el paso de ejecución del flujo de verificación: no está en el menú y ' +
    'sólo se llega desde /dashboard/creditos/verificacion, que sí está marcada.',
  '/dashboard/permisos/correspondencia':
    'Es una pestaña, no una entrada de menú. Su propio layout la filtra con ' +
    '`contratado(plan, p)` y la misma marca `requiereCore`.',
};

function paginas(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) paginas(ruta, acumulado);
    else if (entrada === 'page.tsx') acumulado.push(ruta);
  }
  return acumulado;
}

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('una pantalla del core en una empresa sin core', () => {
  if (!FRONTEND) {
    it('el frontend no está junto al backend: no hay nada que barrer', () => {
      expect(FRONTEND).toBeUndefined();
    });
    return;
  }

  const mapa = sinComentarios(
    readFileSync(join(FRONTEND, 'app/dashboard/module-config.ts'), 'utf8'),
  );

  const delCore = paginas(join(FRONTEND, 'app/dashboard'))
    .filter((ruta) => PREFIJO_CORE.test(sinComentarios(readFileSync(ruta, 'utf8'))))
    .map((ruta) =>
      ruta
        .slice(join(FRONTEND, 'app').length)
        .split('\\')
        .join('/')
        .replace(/\/page\.tsx$/, ''),
    )
    .sort();

  it('encuentra pantallas que hablan con el core', () => {
    /*
     * Un barrido que no encuentra ninguna daría verde por vacío, y con él la
     * sensación de que los tres modos están vigilados.
     */
    expect(delCore.length).toBeGreaterThanOrEqual(5);
  });

  it('toda pantalla que habla con el core está marcada o justificada', () => {
    const sinMarcar = delCore.filter((href) => {
      if (JUSTIFICADAS[href]) return false;
      /*
       * Su entrada en el mapa: desde su `href` hasta el cierre del objeto.
       * Se mira sólo ese tramo para que la marca de la pantalla de al lado no
       * la dé por buena.
       */
      const i = mapa.indexOf(`"${href}"`);
      if (i < 0) return true;
      const tramo = mapa.slice(i, i + 400);
      const fin = tramo.indexOf('},');
      return !/requiereCore:/.test(fin > 0 ? tramo.slice(0, fin) : tramo);
    });
    expect(sinMarcar.sort()).toEqual([]);
  });

  it('cada justificación sigue siendo cierta', () => {
    /*
     * Lo que se afirma arriba se comprueba aquí. Una excepción que nadie
     * vuelve a mirar es una excepción que tapa el defecto siguiente.
     */
    /*
     * Se juntan los incumplimientos en listas en vez de comprobarlos uno a uno:
     * así el fallo dice CUÁL justificación dejó de ser cierta, en vez de parar
     * en la primera y callar el resto.
     */
    const desaparecidas = Object.keys(JUSTIFICADAS).filter(
      (href) => !existsSync(join(FRONTEND, 'app', `${href}/page.tsx`)),
    );
    expect(desaparecidas.sort()).toEqual([]);

    /* Y siguen sin estar en el menú, que es lo que las justifica. */
    const yaEnElMenu = Object.keys(JUSTIFICADAS).filter((href) =>
      mapa.includes(`"${href}"`),
    );
    expect(yaEnElMenu.sort()).toEqual([]);

    /* La pestaña de correspondencia se filtra en su propio layout. */
    const layout = readFileSync(
      join(FRONTEND, 'app/dashboard/permisos/layout.tsx'),
      'utf8',
    );
    expect(layout).toMatch(/requiereCore:\s*'cualquiera'/);
    expect(layout).toMatch(/contratado\(plan,\s*p\)/);

    /* Y «ejecutar» cuelga de una pantalla que sí está marcada. */
    const padre = mapa.indexOf('"/dashboard/creditos/verificacion"');
    expect(padre).toBeGreaterThan(0);
    expect(mapa.slice(padre, padre + 400)).toMatch(/requiereCore:/);
  });

  it('la regla de contratación se escribe una sola vez', () => {
    /*
     * Esta pestaña llevó durante un tiempo su propia copia de la regla
     * (`!p.requiereCore || plan?.usaRegistroExterno`). Cuando apareció el
     * tercer eje, la del mapa aprendió a distinguir cartera de contabilidad y
     * de validación, y la copia se quedó preguntando siempre por el registro
     * externo. Una regla escrita dos veces es una regla que un día dice dos
     * cosas.
     */
    const contratacion = readFileSync(
      join(FRONTEND, 'lib/contratacion.ts'),
      'utf8',
    );
    expect(contratacion).toMatch(/export function contratado/);

    const copias = paginas(join(FRONTEND, 'app/dashboard'))
      .concat(
        readdirSync(join(FRONTEND, 'app/dashboard'), { recursive: true } as never)
          .filter((n) => String(n).endsWith('layout.tsx'))
          .map((n) => join(FRONTEND, 'app/dashboard', String(n))),
      )
      /*
       * Lo que se busca es la REGLA reimplementada —`!x.requiereCore || …`—,
       * no cualquier mención del eje. El menú lateral pregunta
       * `plan?.usaRegistroExterno` para decidir si enseña el enlace al portal,
       * y eso no es una copia de nada: ahí no hay ningún `requiereCore` que
       * interpretar, sólo un enlace que no tiene sentido sin core. Un barrido
       * que lo confundiera obligaría a justificar un acierto, y las
       * justificaciones que sobran son las que acaban tapando un defecto.
       */
      .filter((ruta) =>
        /!\s*\w+\.requiereCore\s*\|\|/.test(
          sinComentarios(readFileSync(ruta, 'utf8')),
        ),
      );
    expect(copias).toEqual([]);
  });
});
