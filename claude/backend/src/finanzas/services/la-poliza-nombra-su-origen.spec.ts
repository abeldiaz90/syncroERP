import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una póliza nombra el documento que sí existe
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Se recibió mercancía desde la pantalla de almacén y la póliza salió con este
 * concepto:
 *
 *   «Compra de mercancía — Orden #589EDAF5»
 *
 * En Compras no existe ninguna orden 589EDAF5. La orden se llama OC-5D00B742.
 * El número que la póliza imprimía era el de la RECEPCIÓN, con la etiqueta de
 * la orden encima, porque el campo se llama `folio` y quien escribió el
 * concepto supuso que era el de la orden.
 *
 * No es cosmético: el asiento es el rastro que sigue un auditor o el contador
 * para volver al documento de origen. Un asiento que nombra un documento
 * inexistente obliga a rastrear a mano lo que debería estar escrito, y de paso
 * hace dudar del resto del renglón.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que el concepto diga qué es cada número: la recepción como recepción, y la
 * orden por el nombre con el que Compras la muestra —`OC-XXXXXXXX`—, y que
 * quien encola el asiento siga mandando ese nombre.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

describe('Contabilidad · una póliza nombra el documento que sí existe', () => {
  const motor = readFileSync(
    join(SRC, 'finanzas/services/motor-contable.service.ts'),
    'utf8',
  );
  const ordenes = readFileSync(
    join(SRC, 'compras/services/ordenes-compra.service.ts'),
    'utf8',
  );

  it('el concepto de compra llama recepción a la recepción', () => {
    const i = motor.indexOf('async generarAsientoDeCompra');
    expect(i).toBeGreaterThan(-1);
    const cuerpo = motor.slice(i, motor.indexOf('\n  async ', i + 10));
    expect(cuerpo).toMatch(/Compra de mercancía — Recepción #\$\{datos\.folio\}/);
    /* Y que no vuelva a llamar «Orden» al folio de la recepción. */
    expect(cuerpo).not.toMatch(/Orden #\$\{datos\.folio\}/);
  });

  it('y nombra la orden como la nombra Compras', () => {
    const i = motor.indexOf('async generarAsientoDeCompra');
    const cuerpo = motor.slice(i, motor.indexOf('\n  async ', i + 10));
    expect(cuerpo).toMatch(/Orden \$\{datos\.folioOrden\}/);
  });

  it('quien encola el asiento manda ese nombre', () => {
    /*
     * El concepto no puede nombrar lo que nadie le pasa. Si alguien quita este
     * campo, la póliza vuelve a hablar sólo de la recepción y la prueba de
     * arriba seguiría pasando.
     */
    const i = ordenes.indexOf('TipoAsiento.COMPRA');
    expect(i).toBeGreaterThan(-1);
    const bloque = ordenes.slice(i, i + 900);
    expect(bloque).toMatch(/folioOrden:\s*`OC-\$\{oc\.id\.slice\(0, 8\)\.toUpperCase\(\)\}`/);
  });

  it('el prefijo coincide con el que enseña la pantalla de órdenes', () => {
    /*
     * La pantalla arma el folio visible igual: `OC-` + los ocho primeros del
     * identificador en mayúsculas. Si una de las dos cambia, el asiento vuelve
     * a mandar a buscar un documento con otro nombre.
     */
    const RAIZ = join(SRC, '..', '..');
    const candidatos = [
      'syncro-erp-frontend/app/dashboard/compras/ordenes/page.tsx',
      'frontend/app/dashboard/compras/ordenes/page.tsx',
    ].map((r) => join(RAIZ, r));
    const pantalla = candidatos
      .map((r) => {
        try {
          return readFileSync(r, 'utf8');
        } catch {
          return '';
        }
      })
      .find((t) => t.length > 0);
    if (!pantalla) return;
    expect(pantalla).toMatch(/OC-\{oc\.id\.substring\(0, 8\)\.toUpperCase\(\)\}/);
  });

  it('los asientos de crédito nombran el crédito por su folio', () => {
    /*
     * Mismo defecto, otro módulo: la póliza de un cobro decía «Cobranza —
     * Crédito d3524196», los ocho primeros del identificador interno. En
     * Crédito y cobranza ese crédito se llama CRD-2026-0011 y buscar
     * «d3524196» no devuelve nada. Son tres asientos: el cobro, su cancelación
     * y el ajuste por devolución en el registro externo.
     */
    for (const generador of [
      'generarAsientoDeCobranza',
      'generarAsientoDeCancelacionCobranza',
      'generarAsientoDeAjusteDevolucionExterna',
    ]) {
      const i = motor.indexOf(`async ${generador}`);
      expect([generador, i > -1]).toEqual([generador, true]);
      const cuerpo = motor.slice(i, motor.indexOf('\n  async ', i + 10));
      expect([generador, /folioCredito/.test(cuerpo)]).toEqual([generador, true]);
    }
    /* Y el módulo de crédito manda ese folio en los tres. */
    const cobranza = readFileSync(
      join(SRC, 'credito/services/cobranza.service.ts'),
      'utf8',
    );
    expect(cobranza.match(/folioCredito: credito\.folio/g)?.length ?? 0).toBe(3);
  });
});
