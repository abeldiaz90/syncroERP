import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { exigirRangoDeFechas } from './utils/business-time.util';

/**
 * ============================================================================
 * El último día del rango se perdía entero
 * ----------------------------------------------------------------------------
 * `new Date('2026-09-27')` son las 00:00 de ese día. Un `Between(desde, hasta)`
 * contra una columna CON HORA deja fuera el día 27 completo: lo que pasó a las
 * 13:30 es posterior a la medianoche del 27.
 *
 * Medido el 27-sep-2026 en Control de costos de alimentos y bebidas. Se
 * consumieron dos recetas a las 13:30 y el reporte —cuyo «Hasta» por omisión
 * es HOY— decía «Sin consumo de recetas en el periodo». Con `hasta=2026-09-28`
 * aparecían los $45.45. El mismo silencio tenían las métricas del CRM y el
 * flujo de efectivo de tesorería.
 *
 * Nadie lo reporta porque no parece un error: parece que hoy no ha pasado nada.
 *
 * LA REGLA: quien compara contra una columna con hora usa `hastaFinDelDia`.
 * `hasta` se reserva para quien trate el valor como un día de calendario —la
 * ocupación hotelera cuenta noches y ahí medianoche es lo correcto—.
 * ============================================================================
 */

const SRC = join(__dirname, '..');

function archivos(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'migrations') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acumulado);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

describe('Rangos de fecha · el último día cuenta', () => {
  it('el ayudante devuelve el final del día, no su medianoche', () => {
    const { desde, hasta, hastaFinDelDia } = exigirRangoDeFechas(
      '2026-09-01',
      '2026-09-27',
    );
    /* Medianoche LOCAL: una fecha sin hora es un día del calendario de quien
       la escribe, no de Greenwich. */
    expect(desde.getHours()).toBe(0);
    expect(desde.getDate()).toBe(1);
    expect(hasta.getHours()).toBe(0);
    expect(hasta.getDate()).toBe(27);
    expect(hastaFinDelDia.getFullYear()).toBe(2026);
    expect(hastaFinDelDia.getMonth()).toBe(8);
    expect(hastaFinDelDia.getDate()).toBe(27);
    expect(hastaFinDelDia.getHours()).toBe(23);
    expect(hastaFinDelDia.getMinutes()).toBe(59);
    // Un movimiento de las 13:30 de ese día tiene que caer dentro.
    expect(new Date('2026-09-27T13:30:00').getTime()).toBeLessThanOrEqual(
      hastaFinDelDia.getTime(),
    );
  });

  it('sigue exigiendo fechas que se entiendan y un rango hacia adelante', () => {
    expect(() => exigirRangoDeFechas('', '2026-09-27')).toThrow(/desde/i);
    expect(() => exigirRangoDeFechas('ayer', '2026-09-27')).toThrow(/no se entiende/i);
    expect(() => exigirRangoDeFechas('2026-09-27', '2026-09-01')).toThrow(/invertido/i);
  });

  it('ningún `Between` sobre una columna con hora termina a medianoche', () => {
    /*
     * Se mira la ventana que rodea a cada `exigirRangoDeFechas`. Si de ahí sale
     * un `Between(...)`, el extremo derecho tiene que ser el fin del día.
     *
     * La excepción legítima es `disponibilidad`, que cuenta NOCHES: ahí el
     * rango son días de calendario y medianoche es lo correcto. Por eso la
     * regla mira los `Between`, que sólo aparecen donde se consulta una
     * columna de marca de tiempo.
     */
    const culpables: string[] = [];
    for (const ruta of archivos(SRC)) {
      const texto = readFileSync(ruta, 'utf8');
      if (!texto.includes('exigirRangoDeFechas')) continue;
      const relativa = ruta.slice(SRC.length + 1).replace(/\\/g, '/');
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        const m = /Between\(\s*([\w.]+)\s*,\s*([\w.]+)\s*\)/.exec(linea);
        if (!m) return;
        const derecha = m[2];
        /*
         * El nombre de la variable es lo que se mira, porque es lo que se lee
         * al revisar el código. Un `fin` que salió de `hastaFinDelDia` se
         * acepta: se comprueba en el destructuring de arriba.
         */
        const ventana = lineas.slice(Math.max(0, i - 25), i).join('\n');
        if (!/exigirRangoDeFechas/.test(ventana)) return;
        const salioDelFinDelDia =
          /hastaFinDelDia/.test(derecha) ||
          new RegExp(
            `hastaFinDelDia\\s*:\\s*${derecha.split('.').pop()}\\b`,
          ).test(ventana);
        if (!salioDelFinDelDia) {
          culpables.push(`${relativa}:${i + 1} → Between(…, ${derecha})`);
        }
      });
    }

    expect(culpables.sort()).toEqual([]);
  });
});
