/**
 * ============================================================================
 * Cerrar el mes con los dos libros diferentes
 * ----------------------------------------------------------------------------
 * LO QUE SE MIDIÓ, 25-sep-2026, contra la instalación en modo ESPEJO:
 *
 *   GET /api/integracion/outbox → 50 eventos · 45 ENVIADO · 5 FALLIDO
 *     «Falta mapear al mayor externo la(s) cuenta(s): 171.04, 613.04.»   ×2
 *     «Falta mapear al mayor externo la(s) cuenta(s): 109.05, 601.46.»   ×1
 *     «Fineract respondió 403: The journal entry cannot be made for a
 *      future date»                                                      ×2
 *
 * Cinco pólizas registradas en el ERP que nunca llegaron al mayor externo.
 *
 * Y el diagnóstico del cierre tenía OCHO controles —pólizas, balanza,
 * integridad, asientos, operaciones, bancos, medición, conciliación— y ni uno
 * preguntaba por la única integración que la empresa declaró como su espejo
 * contable. Agosto se cerró así.
 *
 * Cerrar un mes es afirmar que los números son los definitivos. En modo ESPEJO
 * esa afirmación incluye los del otro lado, o no vale.
 *
 * Estas pruebas fijan las dos mitades: que el control exista cuando el espejo
 * está encendido, y que NO exista cuando está apagado —un control que no puede
 * fallar es ruido, y el ruido tapa a los que sí importan—.
 * ============================================================================
 */

import {
  combinarContabilidad,
  espejoEncendido,
  modoContabilidadGlobal,
} from '../../integracion/utils/modo-contabilidad.util';
import { ModoContabilidad } from '../../integracion/integracion.constants';

describe('Modo del espejo contable · el global es un techo, no un valor por omisión', () => {
  it('sin nada configurado, apagado', () => {
    expect(modoContabilidadGlobal(undefined)).toBe(ModoContabilidad.APAGADO);
    expect(modoContabilidadGlobal('')).toBe(ModoContabilidad.APAGADO);
    expect(modoContabilidadGlobal('APAGADO')).toBe(ModoContabilidad.APAGADO);
  });

  it('lee el techo sin que importen espacios ni mayúsculas', () => {
    // Llega de un .env escrito a mano; ahí sobran espacios con facilidad.
    expect(modoContabilidadGlobal('  espejo  ')).toBe(ModoContabilidad.ESPEJO);
    expect(modoContabilidadGlobal('ESPEJO')).toBe(ModoContabilidad.ESPEJO);
  });

  it('el techo apagado apaga a cualquier empresa', () => {
    expect(
      combinarContabilidad(ModoContabilidad.APAGADO, ModoContabilidad.ESPEJO),
    ).toBe(ModoContabilidad.APAGADO);
  });

  it('el techo encendido NO enciende a quien no lo pidió', () => {
    /*
     * Ésta es la regla que protege a los demás inquilinos: encender el techo
     * global no puede arrastrar a una empresa que jamás contrató el módulo.
     */
    expect(combinarContabilidad(ModoContabilidad.ESPEJO, null)).toBe(
      ModoContabilidad.APAGADO,
    );
    expect(combinarContabilidad(ModoContabilidad.ESPEJO, 'APAGADO')).toBe(
      ModoContabilidad.APAGADO,
    );
  });

  it('con los dos encendidos, el espejo está encendido', () => {
    expect(espejoEncendido('ESPEJO', 'ESPEJO')).toBe(true);
    expect(espejoEncendido('ESPEJO', 'APAGADO')).toBe(false);
    expect(espejoEncendido('APAGADO', 'ESPEJO')).toBe(false);
    expect(espejoEncendido(null, null)).toBe(false);
  });
});

/*
 * ────────────────────────────────────────────────────────────────────────────
 * AQUI HABIA UNA SEGUNDA TANDA DE PRUEBAS Y SE QUITO
 *
 * Reproducian la decision del control —«si hay algo sin entregar, bloquea»— con
 * una copia de la formula escrita en este mismo archivo. Pasaban siempre,
 * porque median la copia, no el servicio: rompi `espejoSinEntregar` en el
 * cierre de verdad y las diez siguieron verdes.
 *
 * Es literalmente el defecto que este proyecto lleva semanas quitando —una
 * prueba que se aprueba a si misma— cometido dentro de la prueba que venia a
 * cazarlo. Las del control viven donde pueden fallar: en
 * `cierre-contable.service.spec.ts`, contra el servicio.
 *
 * Aqui se queda lo que si es codigo compartido y real: la regla del techo.
 * ────────────────────────────────────────────────────────────────────────────
 */
