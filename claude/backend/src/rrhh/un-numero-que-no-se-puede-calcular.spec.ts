/**
 * ============================================================================
 * «NaN días naturales seleccionados.»
 * ----------------------------------------------------------------------------
 * Eso enseñaba la pantalla de Vacaciones el 30-sep-2026 al teclear en el campo
 * «Desde»: `Math.max(0, NaN)` es NaN, y un campo de fecha a medio escribir da
 * exactamente eso.
 *
 * Un número que no se puede calcular no se enseña como si fuera un número.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RUTA = join(
  __dirname, '..', '..', '..',
  'frontend', 'app', 'dashboard', 'rrhh', 'vacaciones', 'page.tsx',
);
const codigo = readFileSync(RUTA, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Se extrae el cálculo del fuente que se despliega y se ejecuta. */
function contador(): (inicio: string, fin: string) => number | null {
  const m = codigo.match(
    /const diasNaturales = useMemo\(\(\): number \| null => \{([\s\S]*?)\n  \}, \[/,
  );
  if (!m) throw new Error('No se encontró el cálculo de diasNaturales');
  const cuerpo = m[1].replace(/form\.fechaInicio/g, 'fechaInicio').replace(/form\.fechaFin/g, 'fechaFin');
  return new Function(
    'fechaInicio',
    'fechaFin',
    cuerpo,
  ) as (inicio: string, fin: string) => number | null;
}

const dias = contador();

describe('diasNaturales · sólo cuenta lo que se puede contar', () => {
  it('un rango normal cuenta ambos extremos', () => {
    expect(dias('2026-10-19', '2026-10-21')).toBe(3);
  });

  it('un solo día cuenta uno, no cero', () => {
    expect(dias('2026-10-19', '2026-10-19')).toBe(1);
  });

  it('cruzar el cambio de mes no se descuadra', () => {
    expect(dias('2026-10-30', '2026-11-02')).toBe(4);
  });

  it('cruzar el cambio de año tampoco', () => {
    expect(dias('2026-12-30', '2027-01-02')).toBe(4);
  });

  it.each([
    ['vacío el inicio', '', '2026-10-21'],
    ['vacío el fin', '2026-10-19', ''],
    ['vacíos los dos', '', ''],
    ['a medio teclear', '261019-09-29', '2026-10-21'],
    ['basura', 'no-es-fecha', '2026-10-21'],
  ])('no devuelve NaN con %s', (_caso, inicio, fin) => {
    const r = dias(inicio, fin);
    expect(r).toBeNull();
    expect(Number.isNaN(r as number)).toBe(false);
  });

  it('un rango al revés no se cuenta: se dice que está mal', () => {
    expect(dias('2026-10-21', '2026-10-19')).toBeNull();
  });

  it('la pantalla no imprime el número cuando no hay número', () => {
    /*
     * El 13-oct esta rama pasó de una plantilla a JSX, porque el bloque dejó de
     * decir sólo «N días naturales» y pasó a traer el desglose de laborables que
     * manda el servidor. La condición es la misma; lo que cambió es cómo se
     * escribe. Así que se exige la GUARDA y el texto, no su ortografía: que la
     * rama de `diasNaturales === null` siga existiendo y siga llevando a esa
     * frase, esté en una plantilla o en un elemento.
     */
    expect(codigo).toMatch(/diasNaturales === null \?/);
    expect(codigo).toContain('Elige un rango de fechas válido.');
    /*
     * Y que la frase viva DENTRO de esa rama, no suelta en cualquier parte: si
     * alguien moviera el texto a otro sitio, las dos comprobaciones de arriba
     * seguirían verdes con el número otra vez impreso.
     */
    const rama = codigo.slice(codigo.indexOf('diasNaturales === null ?'));
    expect(rama.slice(0, 200)).toContain('Elige un rango de fechas válido.');
    /*
     * El `(?<!\$)` importa: sin él, este regex tambien encaja con el
     * `${diasNaturales}` de la plantilla nueva —que es correcto— y la prueba
     * marcaba el arreglo como si fuera el defecto. Lo que se prohibe es la
     * forma JSX cruda, `{diasNaturales}`, que era la que imprimia NaN.
     */
    expect(codigo).not.toMatch(/(?<!\$)\{diasNaturales\} días naturales/);
  });

  it('el cálculo ya no usa Math.max, que es lo que dejaba pasar el NaN', () => {
    const bloque = codigo.slice(
      codigo.indexOf('const diasNaturales'),
      codigo.indexOf('const diasNaturales') + 600,
    );
    expect(bloque).not.toContain('Math.max');
    expect(bloque).toContain('Number.isFinite');
  });
});
