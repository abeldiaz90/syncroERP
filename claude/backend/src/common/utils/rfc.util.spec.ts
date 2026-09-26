/**
 * ============================================================================
 * El RFC de la empresa no lo miraba nadie
 * ----------------------------------------------------------------------------
 * Entraba por la consola de SUMA, viajaba por `POST /aprovisionamiento/empresas`
 * y se guardaba tal cual, sin una sola comprobación en las tres capas.
 *
 * Es la identidad fiscal que va en CADA CFDI de esa empresa. Un error ahí no se
 * nota al dar de alta: se nota el día del primer timbrado, cuando ya hay
 * facturas emitidas y corregirlo significa cancelarlas.
 * ============================================================================
 */

import { normalizarRfc, revisarRfc } from './rfc.util';

const valido = (rfc: string) => revisarRfc(rfc);
/** El motivo, o cadena vacía si el veredicto fue favorable. */
const motivoDe = (rfc: string) => revisarRfc(rfc).motivo ?? '';

describe('RFC · forma y fecha', () => {
  it('acepta una persona moral', () => {
    const r = valido('SUM230815AB1');

    expect(r.valido).toBe(true);
    expect(r.tipo).toBe('MORAL');
  });

  it('acepta una persona física', () => {
    const r = valido('DIAA850312HX4');

    expect(r.valido).toBe(true);
    expect(r.tipo).toBe('FISICA');
  });

  it('acepta los RFC genéricos del SAT', () => {
    /*
     * `XAXX010101000` (público en general) y `XEXX010101000` (extranjero) son
     * legítimos y aparecen en facturación real. Rechazarlos rompería el CFDI de
     * mostrador.
     */
    expect(valido('XAXX010101000').valido).toBe(true);
    expect(valido('XEXX010101000').valido).toBe(true);
  });

  it('normaliza espacios, guiones y minúsculas', () => {
    expect(normalizarRfc(' sum-230815 ab1 ')).toBe('SUM230815AB1');
    const r = valido('sum-230815 ab1');
    expect(r.normalizado).toBe('SUM230815AB1');
  });

  it('acepta la Ñ y el & de las razones sociales', () => {
    // «Muñoz y Cía», «Pérez & Asociados»: existen y son válidos.
    expect(valido('MUÑ230815AB1').valido).toBe(true);
    expect(valido('P&A230815AB1').valido).toBe(true);
  });

  it('rechaza el vacío diciendo que está vacío', () => {
    const r = revisarRfc('');
    expect(r.valido).toBe(false);
    expect(motivoDe('')).toMatch(/vacío/i);
  });

  it('rechaza una longitud imposible y dice cuántos caracteres hay', () => {
    const r = valido('SUM2308');
    expect(r.valido).toBe(false);
    expect(motivoDe('SUM2308')).toMatch(/7 caracteres/);
  });

  it('rechaza el mes 13, que es el error de captura más común', () => {
    const r = valido('SUM231315AB1');
    expect(r.valido).toBe(false);
    expect(motivoDe('SUM231315AB1')).toMatch(/no existe/i);
  });

  it('rechaza el 29 de febrero de un año que no es bisiesto', () => {
    /*
     * 2013 no fue bisiesto; 2012 sí. Comprobar sólo «mes 1-12, día 1-31»
     * dejaría pasar el primero, que es una fecha que no ocurrió.
     */
    expect(valido('ABC130229XX1').valido).toBe(false);
    expect(valido('ABC120229XX1').valido).toBe(true);
  });

  it('rechaza el 31 de un mes de 30 días', () => {
    expect(valido('ABC130431XX1').valido).toBe(false);
  });

  it('rechaza una homoclave con caracteres que no existen en ella', () => {
    const r = valido('SUM230815A-1');
    expect(r.valido).toBe(false);
  });

  it('rechaza una homoclave de cuatro caracteres', () => {
    /*
     * 13 caracteres, pero con tres letras iniciales: la persona tecleó un
     * carácter de más en la homoclave y el total le cuadró con el de una
     * persona física. Comprobar sólo la longitud total lo dejaría pasar.
     */
    const r = valido('SUM230815AB12');

    expect(r.valido).toBe(false);
    // Y el mensaje enseña las dos formas válidas, que es lo que necesita quien
    // lo lee para ver cuál de las dos quiso escribir.
    expect(motivoDe('SUM230815AB12')).toMatch(/persona moral lleva 3 letras/i);
  });

  it('el motivo nombra el RFC que se rechaza', () => {
    // Quien lo lee está dando de alta una empresa y tiene que ver qué tecleó.
    const r = valido('SUM231315AB1');
    expect(motivoDe('SUM231315AB1')).toContain('SUM231315AB1');
  });
});
