/**
 * ============================================================================
 * La incidencia que llegó tarde
 * ----------------------------------------------------------------------------
 * Medido por pantalla el 30-sep-2026: se aprobó una falta de Laura con fecha
 * 30-sep, y su periodo —#18, 16–30 sep— ya estaba PAGADO. El cálculo sólo mira
 * las incidencias cuyo rango cae dentro del periodo, así que:
 *
 *   · no se aplicó en el #18, que ya se pagó;
 *   · no se aplicaría en el #20 ni en ninguno posterior;
 *   · se quedaba APROBADA para siempre, contada en el indicador «Días no
 *     pagados» de la pantalla y descontada de nadie.
 *
 * Y no es un caso de laboratorio: enterarse tarde de una falta es lo más normal
 * de una empresa.
 *
 * Decisión de Abel del 30-sep-2026: opción **B**, aplicación retroactiva en el
 * siguiente periodo que se calcule, como SAP, Business Central y Workday.
 *
 * Lo que esta prueba fija son los dos candados que impiden que B se convierta
 * en cobrar dos veces, y los tres efectos retroactivos.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RUTA = join(__dirname, 'services', 'nomina-calculo.service.ts');
const codigo = readFileSync(RUTA, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── Los días completos, ejecutados desde el fuente que se despliega ─────── */

type Inc = { dias?: number; fechaInicio: string | Date; fechaFin: string | Date };

function diasCompletos(): (i: Inc) => number {
  const m = codigo.match(
    /private diasCompletosDeIncidencia\(incidencia: Incidencia\): number \{([\s\S]*?)\n  \}/,
  );
  if (!m) throw new Error('No se encontró diasCompletosDeIncidencia');
  const cuerpo = m[1].replace(/this\.soloFecha/g, 'soloFecha');
  return new Function(
    'money',
    'MS_DIA',
    'soloFecha',
    `return function (incidencia) {${cuerpo}};`,
  )(
    (n: number) => Math.round(n * 100) / 100,
    86400000,
    (v: string | Date) => {
      const d = v instanceof Date ? v : new Date(`${v}T00:00:00`);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
  ) as (i: Inc) => number;
}

const dias = diasCompletos();

describe('diasCompletosDeIncidencia · toda la incidencia, sin recortar', () => {
  it('respeta los días capturados cuando los hay', () => {
    /*
     * El caso tiene que DISTINGUIR: con 3 días capturados sobre un rango de 3
     * días, deducirlos del rango da lo mismo y la prueba no mide nada. La
     * primera versión de esta prueba hacía justo eso y el mutante que ignora
     * los capturados sobrevivió. Aquí el rango son 3 días y lo capturado es 1
     * —media incapacidad, un permiso de un día dentro de un rango—, así que
     * sólo hay una respuesta correcta.
     */
    expect(dias({ dias: 1, fechaInicio: '2026-09-19', fechaFin: '2026-09-21' })).toBe(1);
    expect(dias({ dias: 2.5, fechaInicio: '2026-09-19', fechaFin: '2026-09-25' })).toBe(2.5);
  });

  it('los deduce del rango cuando no vienen capturados', () => {
    expect(dias({ dias: 0, fechaInicio: '2026-09-19', fechaFin: '2026-09-21' })).toBe(3);
  });

  it('un solo día cuenta uno, no cero', () => {
    expect(dias({ dias: 0, fechaInicio: '2026-09-30', fechaFin: '2026-09-30' })).toBe(1);
  });

  it('un rango al revés no inventa días negativos', () => {
    expect(dias({ dias: 0, fechaInicio: '2026-09-30', fechaFin: '2026-09-28' })).toBe(0);
  });

  it('cruzar el cambio de mes no se descuadra', () => {
    expect(dias({ dias: 0, fechaInicio: '2026-09-29', fechaFin: '2026-10-02' })).toBe(4);
  });
});

/* ── Los candados ────────────────────────────────────────────────────────── */

describe('Candado 1 · lo que ya movió un recibo no vuelve a moverlo', () => {
  it('sólo se traen las APROBADA, nunca las APLICADA', () => {
    const bloque = codigo.slice(
      codigo.indexOf('private async obtenerRetroactivas'),
      codigo.indexOf('private async obtenerRetroactivas') + 1400,
    );
    expect(bloque).toMatch(/estadoAprobacion = :aprobada/);
    expect(bloque).toMatch(/aprobada: 'APROBADA'/);
    expect(bloque).not.toMatch(/APLICADA/);
  });

  it('y sólo las que no se aplicaron en ningún periodo', () => {
    const bloque = codigo.slice(
      codigo.indexOf('private async obtenerRetroactivas'),
      codigo.indexOf('private async obtenerRetroactivas') + 1400,
    );
    expect(bloque).toMatch(/i\.periodoAplicadoId IS NULL/);
  });

  it('la consulta del periodo excluye las aplicadas en OTRO periodo', () => {
    expect(codigo).toMatch(
      /i\.periodoAplicadoId IS NULL OR i\.periodoAplicadoId = :periodoId/,
    );
  });

  it('al consumirlas se anota en qué periodo, no sólo que se aplicaron', () => {
    expect(codigo).toMatch(/estadoAprobacion: 'APLICADA', periodoAplicadoId: periodo\.id/);
  });

  it('se marcan las del periodo Y las retroactivas, no sólo unas', () => {
    expect(codigo).toMatch(/const consumidas = \[\.\.\.incidencias, \.\.\.retroactivas\]/);
    expect(codigo).toMatch(/id: In\(consumidas\.map/);
  });
});

describe('Candado 2 · no se le roba la incidencia al periodo que aún la espera', () => {
  const bloque = codigo.slice(
    codigo.indexOf('private async obtenerRetroactivas'),
    codigo.indexOf('private async obtenerRetroactivas') + 2000,
  );

  it('sólo se consideran las anteriores al periodo, nunca las del futuro', () => {
    expect(bloque).toMatch(/i\.fechaFin < :inicio/);
  });

  it('se buscan los periodos que todavía pueden calcularla', () => {
    expect(bloque).toMatch(/EstadoPeriodo\.ABIERTO, EstadoPeriodo\.CALCULANDO/);
  });

  it('y se descartan las que caen en uno de ellos', () => {
    expect(bloque).toMatch(/candidatas\.filter\(\(i\) => !calculables\.some\(\(p\) => cae\(i, p\)\)\)/);
  });

  it('el periodo que se está calculando no se cuenta a sí mismo', () => {
    expect(bloque).toMatch(/p\.id <> :periodoId/);
  });
});

/* ── Los tres efectos ────────────────────────────────────────────────────── */

describe('Los tres efectos retroactivos', () => {
  it('la falta atrasada va como DEDUCCIÓN con su renglón, no restando días del sueldo', () => {
    expect(codigo).toMatch(/clave: 'D003'/);
    expect(codigo).toMatch(/naturaleza: NaturalezaConcepto\.DEDUCCION/);
    expect(codigo).toMatch(/Faltas de periodos anteriores/);
  });

  it('el renglón dice de qué fechas viene', () => {
    expect(codigo).toMatch(/rangosDeIncidencias/);
    expect(codigo).toMatch(/Faltas de periodos anteriores \(\$\{periodos\}\)/);
  });

  it('las vacaciones atrasadas suman sus días a la prima vacacional', () => {
    const bloque = codigo.slice(
      codigo.indexOf('const diasVacaciones'),
      codigo.indexOf('const diasVacaciones') + 600,
    );
    expect(bloque).toMatch(/incidenciasRetroactivas/);
    expect(bloque).toMatch(/diasCompletosDeIncidencia/);
  });

  it('las horas extra atrasadas se miden sobre su propia semana', () => {
    expect(codigo).toMatch(/retroactivas = false,/);
    expect(codigo).toMatch(/retroactivas\s*\?\s*this\.diasCompletosDeIncidencia\(incidencia\)/);
    expect(codigo).toMatch(/horasExtraRetro/);
  });

  it('el cálculo avisa de lo que aplicó con retraso', () => {
    expect(codigo).toMatch(/de periodos ya /);
    expect(codigo).toMatch(/alertas\.push\(\s*`Se aplican \$\{diasNoPagadosRetro\}/);
  });

  it('las retroactivas NO reducen los días trabajados del periodo que las cobra', () => {
    /*
     * `diasNoPagados` es lo que baja `diasPagados` y con ello la cantidad del
     * P001. Si las retroactivas entraran ahí, el recibo de octubre diría 15
     * días trabajados, que es falso.
     */
    /*
     * El ancla no puede ser el texto que el mutante cambia. La primera versión
     * buscaba `const diasNoPagados = incidencias`, que es exactamente lo que
     * modifica meter las retroactivas ahí: `indexOf` devolvía -1, el slice
     * salía por otro lado y el mutante sobrevivió.
     */
    const desde = codigo.indexOf('const diasNoPagados');
    const hasta = codigo.indexOf('const diasPagados');
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    const bloque = codigo.slice(desde, hasta);
    expect(bloque).not.toMatch(/incidenciasRetroactivas/);
    expect(bloque).toContain('const diasNoPagados = incidencias');
  });
});
