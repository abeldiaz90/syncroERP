/**
 * ============================================================================
 * Una comparación que se cae no sigue afirmando
 * ----------------------------------------------------------------------------
 * `conciliarEmpresa` recorre las pólizas espejadas una a una y le pregunta al
 * mayor externo por cada asiento. El cliente HTTP hacia Fineract lleva un
 * cortacircuitos: cinco fallos seguidos y se abre veinte segundos, durante los
 * cuales toda llamada revienta al instante sin salir a la red.
 *
 * El bucle no lo sabía. Medido en vivo el 30-sep-2026, con el contador: la
 * comparación devolvió ~110 hallazgos, y todos decían lo mismo —«Circuito
 * abierto hacia Fineract»—. Tres consecuencias:
 *
 *   · Los cinco fallos de verdad quedaron enterrados entre cien copias.
 *   · La bandeja de avisos se llenó de sedimento que no describe ninguna
 *     póliza, sino un instante.
 *   · Y la peor: la corrida AFIRMABA ciento diez cosas habiendo medido cinco.
 *
 * Ahora, cuando el enlace se cae, la comparación se detiene y lo dice. Lo que
 * no se miró no se reporta: se cuenta como pendiente.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const servicio = readFileSync(
  join(__dirname, 'services', 'contabilidad-conciliacion.service.ts'),
  'utf8',
);
const codigo = servicio
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const http = readFileSync(
  join(__dirname, 'adaptadores', 'fineract', 'fineract-http.service.ts'),
  'utf8',
);

describe('El cortacircuitos existe y es el que se creía', () => {
  it('se abre a los cinco fallos seguidos, por veinte segundos', () => {
    /*
     * Si estos números cambian, el bucle de la conciliación no se rompe —ya
     * se detiene solo—, pero la explicación de arriba deja de ser cierta y
     * conviene releerla.
     */
    expect(http).toMatch(/umbralApertura = 5/);
    expect(http).toMatch(/reposoMs = 20_000/);
  });

  it('con el circuito abierto ni siquiera se intenta la llamada', () => {
    expect(http).toMatch(/if \(Date\.now\(\) < this\.abiertoHasta\) \{/);
    expect(http).toMatch(/'Circuito abierto hacia Fineract\.'/);
  });
});

describe('La comparación se detiene cuando el enlace se cae', () => {
  it('pregunta por el enlace justo después de un fallo de lectura', () => {
    expect(codigo).toMatch(/if \(!this\.externa\.disponible\(\)\) \{/);
  });

  it('y rompe el bucle en lugar de seguir', () => {
    const iCatch = codigo.indexOf("agregar(\n          'CONSULTA_FALLIDA',");
    const iDisponible = codigo.indexOf('if (!this.externa.disponible())');
    const iBreak = codigo.indexOf('break;', iDisponible);
    expect(iCatch).toBeGreaterThan(-1);
    expect(iDisponible).toBeGreaterThan(iCatch);
    expect(iBreak).toBeGreaterThan(iDisponible);
  });

  it('cuenta lo que quedó sin mirar, y no lo reporta como hallazgo', () => {
    expect(codigo).toMatch(
      /pendientesDeComparar = links\.length - revisados;/,
    );
  });

  it('el resultado dice si la corrida fue completa', () => {
    /*
     * `completa` viaja en el resultado y no se deduce de que no haya
     * hallazgos: una corrida que se cortó a la tercera póliza y no encontró
     * nada no dice lo mismo que una que recorrió las ciento diez.
     */
    expect(codigo).toMatch(/completa: interrumpida === null,/);
    expect(codigo).toMatch(/interrumpida,/);
  });

  it('el motivo nombra cuántas se revisaron y cuántas había', () => {
    expect(servicio).toMatch(/tras revisar \$\{revisados\} /);
    expect(servicio).toMatch(/de \$\{links\.length\} póliza\(s\)/);
    expect(servicio).toMatch(/no se sabe nada de ellas hasta la próxima corrida/);
  });
});

describe('Y la pantalla no la enseña como si hubiera terminado', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
    .map((nombre) => join(RAIZ, nombre))
    .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
  const ruta = FRONTEND
    ? join(FRONTEND, 'app/dashboard/finanzas/espejo-contable/page.tsx')
    : '';
  const hay = Boolean(ruta && existsSync(ruta));
  const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

  it('la interrupción se pregunta ANTES que «coinciden»', () => {
    /*
     * Al revés, una corrida cortada sin hallazgos saldría en verde diciendo
     * que los dos mayores coinciden. Sería la peor frase de esta pantalla.
     */
    if (!hay) return;
    const iInterrumpida = pantalla.indexOf('conciliacion.completa === false');
    const iCoinciden = pantalla.indexOf('conciliacion.discrepancias === 0 ? (');
    expect(iInterrumpida).toBeGreaterThan(-1);
    expect(iCoinciden).toBeGreaterThan(-1);
    expect(iInterrumpida).toBeLessThan(iCoinciden);
  });

  it('dice cuántas quedaron sin comparar', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/La comparación se interrumpió/);
    expect(pantalla).toMatch(/conciliacion\.pendientesDeComparar \?\? 0/);
  });

  it('el aviso tampoco celebra una corrida cortada', () => {
    if (!hay) return;
    expect(pantalla).toMatch(/if \(r\.completa === false\) \{/);
  });

  it('y el indicador del enlace se vuelve a preguntar', () => {
    /*
     * Decía «En línea» mientras la comparación de tres centímetros más abajo
     * reportaba el circuito abierto: no eran dos verdades distintas, era un
     * dato leído al cargar la página y nunca revisado.
     */
    if (!hay) return;
    expect(pantalla).toMatch(
      /Si el enlace se cayó, el indicador de arriba ya no dice la verdad[\s\S]{0,80}estado\.recargar\(\)/,
    );
  });
});
