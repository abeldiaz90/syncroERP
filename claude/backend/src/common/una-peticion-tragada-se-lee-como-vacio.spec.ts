import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una petición tragada se lee como «no hay»
 * ----------------------------------------------------------------------------
 * EL DEFECTO QUE VIGILA
 *
 * `api.get(...).catch(() => [])` convierte **cualquier** fallo en una lista
 * vacía. Y una lista vacía, en una pantalla, no se lee como «falló»: se lee
 * como **«no hay»**.
 *
 * Es la peor forma del error porque es tranquilizadora. Un 403 dice «esto no
 * es de tu rol» y la pantalla dice «no tienes clientes». Un 500 dice «el
 * servidor se cayó» y la pantalla dice «no tienes pólizas». Nadie reporta un
 * fallo que no parece un fallo, y el que mira toma decisiones sobre un cero
 * que no es cierto.
 *
 * Este proyecto ya tiene las dos piezas para hacerlo bien:
 *
 *   · `conPermiso()` convierte **sólo** la negativa de las guardias en un dato
 *     —`vedado: true`— para que la pantalla diga «esto no es de tu rol». Un 403
 *     que explica una regla de negocio sigue subiendo, y un 500 también.
 *   · `intentar(promesa, respaldo)`, para lo accesorio que de verdad puede
 *     faltar sin que la pantalla mienta.
 *
 * BARRIDO DEL 11-OCT-2026
 *
 * Dos casos en todo el front, y los dos legítimos; están abajo con su razón.
 * Los otros 69 `.catch(() => …)` del front son `respuesta.json().catch(…)`,
 * que es otra cosa: un cuerpo vacío no es un error, es un 204.
 *
 * Esta prueba existe para que el tercero no entre sin que nadie lo mire.
 * ============================================================================
 */

const FRONT = join(__dirname, '..', '..', '..', 'frontend', 'app');

/**
 * Peticiones cuyo fallo se traga a propósito, con su razón. Sin entrada aquí,
 * la prueba falla: declararla obliga a justificarla.
 */
const JUSTIFICADAS: Record<string, string> = {
  'dashboard/finanzas/cierre-contable/page.tsx':
    'Está DENTRO de un catch: la pantalla ya falló, ya lo dijo, y vuelve a leer el estado ' +
    'actual para no quedarse pintando uno viejo. Si esa segunda lectura también falla, no ' +
    'hay nada mejor que hacer y el error original sigue en pantalla.',
  'dashboard/finanzas/saldos-iniciales/page.tsx':
    'El catálogo de cuentas y el estado del libro diario se piden juntos, y son cosas ' +
    'distintas: que no se pueda leer el libro no puede dejar sin catálogo a la pantalla. ' +
    'El catálogo sí sube su error.',
};

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      archivos(ruta, salida);
      continue;
    }
    if (entrada.endsWith('.tsx') || entrada.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** `api.<verbo>(...).catch(() => vacío)` — la petición entera tragada. */
const TRAGADA =
  /api\s*\.\s*(get|post|put|patch|delete)\s*(?:<[\s\S]{0,80}?>)?\s*\([^;]{0,200}?\)\s*\.catch\(\s*\(\s*[^)]*\)\s*=>\s*(\[\]|\{\}|null|0)\s*\)/;

const PANTALLAS = archivos(FRONT).map((ruta) => ({
  relativa: ruta.slice(FRONT.length + 1).replace(/\\/g, '/'),
  texto: readFileSync(ruta, 'utf8'),
}));

describe('una petición tragada se lee como «no hay»', () => {
  it('hay pantallas que mirar', () => {
    /* Si el barrido fallara, lo de abajo pasaría vacío y en verde. */
    expect(PANTALLAS.length).toBeGreaterThan(100);
    expect(PANTALLAS.some((p) => p.relativa === 'dashboard/clientes/page.tsx')).toBe(true);
  });

  it('ninguna pantalla convierte un fallo en «no hay», salvo las declaradas', () => {
    const culpables = PANTALLAS.filter(
      ({ relativa, texto }) => TRAGADA.test(sinComentarios(texto)) && !JUSTIFICADAS[relativa],
    ).map((p) => p.relativa);

    expect(culpables).toEqual([]);
  });

  it('y las declaradas siguen existiendo y siguen tragando', () => {
    /*
     * Una justificación que sobrevive al código que justificaba es ruido que
     * despista: el día que alguien lea esta lista creerá que ahí hay algo que
     * mirar.
     */
    const sobran = Object.keys(JUSTIFICADAS).filter((relativa) => {
      const pantalla = PANTALLAS.find((p) => p.relativa === relativa);
      return !pantalla || !TRAGADA.test(sinComentarios(pantalla.texto));
    });
    expect(sobran).toEqual([]);
  });

  it('cada razón está escrita, no sólo nombrada', () => {
    /*
     * Jest no admite un mensaje como segundo argumento de `expect` —eso es de
     * vitest, y este proyecto corre los dos—. Así que las que fallan se juntan
     * y se comparan contra la lista vacía: el nombre del archivo sale en el
     * error igual, y además salen todos de una vez.
     */
    const flojas = Object.entries(JUSTIFICADAS)
      .filter(([, razon]) => razon.length <= 100)
      .map(([ruta]) => ruta);
    expect(flojas).toEqual([]);
  });

  it('las dos piezas de la casa siguen ahí', () => {
    /*
     * `conPermiso` distingue «no es de tu rol» de «algo falló», que es la
     * diferencia que esta prueba defiende. Si desapareciera, las pantallas
     * volverían a tragar por falta de alternativa.
     */
    const api = readFileSync(
      join(__dirname, '..', '..', '..', 'frontend', 'lib', 'api.ts'),
      'utf8',
    );
    expect(api).toMatch(/export async function conPermiso</);
    expect(api).toMatch(/export async function intentar</);
    /* Y sigue sin tragarse el 403 que explica una regla de negocio. */
    expect(api).toMatch(/esSinPermisos && !error\.esNegacionDeRegla/);
  });

  describe('la prueba de la prueba', () => {
    it('la forma mala se detecta', () => {
      expect(TRAGADA.test("const c = await api.get<Cliente[]>('/clientes').catch(() => []);")).toBe(
        true,
      );
      expect(TRAGADA.test("api.get<X>('/x').catch(() => null)")).toBe(true);
    });

    it('y las formas buenas no', () => {
      /* Leer un cuerpo que puede venir vacío no es tragarse una petición. */
      expect(TRAGADA.test('const d = await r.json().catch(() => null);')).toBe(false);
      expect(TRAGADA.test("const { valor, vedado } = await conPermiso(api.get('/x'));")).toBe(
        false,
      );
      expect(TRAGADA.test("const x = await intentar(api.get<T[]>('/x'), []);")).toBe(false);
    });
  });
});
