import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Un bloqueo sin salida no es un control
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El tablero de integridad financiera decía BLOQUEADO con un hallazgo crítico:
 *
 *   NOMINA_DEFINITIVA_SIN_POLIZA — «Periodos pagados, contabilizados o cerrados
 *   sin póliza vinculada. Bloquear el cierre y generar la póliza de devengo
 *   antes de continuar.»
 *
 * Se fue a generarla, desde la pantalla, y la contabilidad contestó:
 *
 *   «No se puede registrar una póliza con fecha 2026-09-30, que todavía no
 *    llega. La contabilidad registra lo que ya ocurrió.»
 *
 * Las dos reglas son correctas. El devengo pertenece al periodo y por eso se
 * fecha su último día; y no se asientan hechos que no han ocurrido. Juntas
 * dejaban al contador delante de una pared: el cierre mensual exigía una
 * póliza que el sistema se negaba a crear, y no había ninguna acción que
 * resolviera el hallazgo.
 *
 * El origen era legítimo: una quincena que termina el 30 y se pagó el 25. Pagar
 * por adelantado pasa. Lo que no puede pasar es que se lea igual que un olvido.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que los dos casos sigan separados: el que exige acción —el periodo ya
 * terminó y nadie lo contabilizó— bloquea; el que sólo hay que esperar
 * informa, no bloquea, y dice cuándo. Y que quien pida la póliza antes de
 * tiempo reciba esa explicación, no el error genérico de fechas.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

describe('Integridad · un bloqueo sin salida no es un control', () => {
  const integridad = readFileSync(
    join(SRC, 'finanzas/services/integridad-financiera.service.ts'),
    'utf8',
  );
  const nomina = readFileSync(
    join(SRC, 'rrhh/advanced/nomina-avanzada.service.ts'),
    'utf8',
  );

  const definicion = (codigo: string) => {
    const i = integridad.indexOf(`codigo: '${codigo}'`);
    if (i < 0) return '';
    return integridad.slice(i, integridad.indexOf('},', i));
  };

  it('el hallazgo crítico sólo mira periodos que ya terminaron', () => {
    const d = definicion('NOMINA_DEFINITIVA_SIN_POLIZA');
    expect(d).not.toBe('');
    expect(d).toContain('CRITICA');
    expect(d).toMatch(/fechaFin\s*<=\s*CURRENT_DATE/);
  });

  it('el periodo pagado por adelantado se informa y no bloquea', () => {
    const d = definicion('NOMINA_PAGADA_POR_ADELANTADO');
    expect(d).not.toBe('');
    /* MEDIA no cuenta para el estado BLOQUEADO; CRITICA sí. */
    expect(d).toContain("severidad: 'MEDIA'");
    expect(d).toMatch(/fechaFin\s*>\s*CURRENT_DATE/);
    expect(d).toMatch(/no ha terminado|todavía no se puede registrar/i);
  });

  it('sólo lo crítico y lo alto deciden el semáforo', () => {
    /*
     * Si mañana alguien hace que MEDIA cuente para bloquear, el hallazgo de
     * arriba vuelve a ser una pared sin que nadie lo note.
     */
    const i = integridad.indexOf('const criticos');
    const bloque = integridad.slice(i, i + 900);
    expect(bloque).toMatch(/criticos\s*>\s*0[\s\S]{0,60}'BLOQUEADO'/);
    expect(bloque).not.toMatch(/medias\s*>\s*0[\s\S]{0,40}'BLOQUEADO'/);
  });

  it('pedir el devengo antes de tiempo explica cuándo se podrá', () => {
    const i = nomina.indexOf('async generarPolizaDetallada');
    expect(i).toBeGreaterThan(-1);
    const cuerpo = nomina.slice(i, nomina.indexOf('\n  async ', i + 10));
    expect(cuerpo).toMatch(/último día del periodo/);
    expect(cuerpo).toMatch(/se podrá generar ese día/);
    /* Y que la comprobación vaya ANTES de crear la póliza, no después. */
    const iAviso = cuerpo.indexOf('se podrá generar ese día');
    const iPoliza = cuerpo.indexOf('crearPolizaManualEnTransaccion');
    expect(iAviso).toBeGreaterThan(-1);
    expect(iPoliza).toBeGreaterThan(iAviso);
  });

  it('y lo pide sin comillas, como toda consulta de este archivo', () => {
    /*
     * Se escribió `"fechaFin"` la primera vez y las dos comprobaciones dejaron
     * de poder medirse: la estrategia de nombres guarda las columnas en
     * minúsculas, Postgres respeta las mayúsculas del identificador
     * entrecomillado y no encuentra la columna. Lo bueno es que se vio: el
     * panel dijo «no se pudo medir» en vez de contestar cero. Lo malo sería
     * repetirlo.
     */
    const entrecomillado = /"[a-z]+[A-Z][A-Za-z0-9]*"/g;
    const sqls = [...integridad.matchAll(/sql:\s*`([\s\S]*?)`/g)].map((m) => m[1]);
    const culpables = sqls.filter((q) => entrecomillado.test(q));
    expect(culpables).toEqual([]);
  });
});
