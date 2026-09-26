import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Cancelar una póliza dejaba un bloqueo permanente en el cierre
 * ----------------------------------------------------------------------------
 * Una póliza CANCELADA no se espeja al mayor externo, y está bien: su reversa
 * viaja como póliza propia, con su propio evento. El despachador lo sabía y lo
 * lanzaba como error no reintentable, así que el evento quedaba en **FALLIDO**.
 *
 * Y FALLIDO significa «alguien tiene que ir a mirar esto»: enciende la pantalla
 * de administración y —desde que existe el control `ESPEJO_CONTABLE` del cierre
 * mensual, añadido esta misma noche— **bloquea el cierre del mes**.
 *
 * Es decir: cancelar una póliza, que es una operación contable normalísima,
 * dejaba un bloqueo que nadie podía resolver, porque no había nada que
 * resolver. Medido el 25-sep-2026 con la póliza de prueba DI-2026-00018, que
 * cancelé yo mismo una hora antes de que el control existiera.
 *
 * Vale la pena decirlo con todas sus letras: **el control nuevo convirtió en
 * bloqueante un defecto que antes sólo ensuciaba una pantalla.** Endurecer un
 * sistema saca a la luz lo que estaba mal clasificado, y hay que ir a
 * arreglarlo, no aflojar el control.
 * ============================================================================
 */

import {
  ErrorIntegracionExterna,
  EventoSinDestino,
} from '../ports/cartera-externa.port';

describe('EventoSinDestino · ni error ni pendiente', () => {
  const sinDestino = new EventoSinDestino(
    'La póliza DI-2026-00018 está cancelada; su reversa viaja como póliza propia.',
  );

  it('es un ErrorIntegracionExterna, para que el resto del código lo trate igual', () => {
    expect(sinDestino).toBeInstanceOf(ErrorIntegracionExterna);
  });

  it('no se reintenta: no va a tener destino la próxima vez tampoco', () => {
    expect(sinDestino.reintentable).toBe(false);
  });

  it('no pudo aplicarse: no salió nada hacia el proveedor', () => {
    /*
     * Importa para el vínculo: `pudoAplicarse` en true dejaría una marca «en
     * vuelo» pidiendo que un humano vaya a mirar un asiento que no existe.
     */
    expect(sinDestino.pudoAplicarse).toBe(false);
  });

  it('conserva la razón, que es lo que alguien leerá en la bandeja', () => {
    expect(sinDestino.message).toContain('DI-2026-00018');
    expect(sinDestino.message).toMatch(/cancelada/i);
  });

  it('se distingue de un fallo de verdad', () => {
    // Un 500 del proveedor SÍ es un fallo y SÍ tiene que reintentarse.
    const falloReal = new ErrorIntegracionExterna('502 del proveedor', true);

    expect(falloReal instanceof EventoSinDestino).toBe(false);
    expect(sinDestino instanceof EventoSinDestino).toBe(true);
  });
});

/**
 * Y la decisión del despachador. Esto se lee del CÓDIGO FUENTE y no de una
 * copia de la lógica escrita aquí: la primera versión de esta prueba
 * reproducía el `if` en el propio archivo de prueba y pasaba siempre, porque
 * medía la copia. Es el mismo defecto que este proyecto lleva semanas quitando
 * —una prueba que se aprueba a sí misma— cometido dentro de la prueba.
 */
describe('El despachador clasifica bien lo que no tiene destino', () => {
  const fuente = readFileSync(
    join(__dirname, 'integracion-despachador.service.ts'),
    'utf8',
  );

  it('la póliza cancelada se lanza como EventoSinDestino', () => {
    const bloque = /if \(poliza\.estatus === 'CANCELADA'\) \{[\s\S]{0,300}?\}/.exec(
      fuente,
    )?.[0];

    expect(bloque).toBeDefined();
    expect(bloque).toContain('EventoSinDestino');
    expect(bloque).not.toContain('ErrorIntegracionExterna');
  });

  it('el despachador lo descarta ANTES de contarlo como fallo', () => {
    /*
     * El orden es la regla: si se llegara a `marcarFallo` primero, el evento
     * quedaría FALLIDO y el control del espejo contable bloquearía el cierre.
     *
     * Se mide DENTRO del `catch` del despacho, no por la posición en el
     * archivo: la primera versión comparaba `indexOf` sobre el fichero entero y
     * fallaba por un `marcarFallo` que aparece antes en otro sitio. Medir la
     * distancia entre dos cadenas no es medir el flujo.
     */
    const bloque = /catch \(error\) \{[\s\S]*?marcarFallo\(/.exec(fuente)?.[0];

    expect(bloque).toBeDefined();
    expect(bloque).toContain('instanceof EventoSinDestino');
    expect(bloque).toContain('marcarDescartado');
    // Y sale del `catch` sin seguir: si no, contaría las dos cosas.
    expect(bloque).toContain('continue;');
  });

  it('el descarte no suma a la cuenta de fallidos', () => {
    // `fallidos` es lo que la pantalla y el cierre leen como divergencia.
    const rama = /if \(error instanceof EventoSinDestino\) \{[\s\S]{0,300}?\}/.exec(
      fuente,
    )?.[0];

    expect(rama).toBeDefined();
    expect(rama).toContain('descartados += 1');
    expect(rama).not.toContain('fallidos += 1');
  });
});
