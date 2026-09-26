import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Gravado a cero, exento y no objeto son tres cosas distintas
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El CFDI de una venta deducía la postura fiscal de cada partida del importe
 * del impuesto:
 *
 *     objetoImpuesto: tasaIVA > 0 ? '02' : '01',
 *     tipoFactor:     tasaIVA > 0 ? 'TASA' : 'NO_OBJETO',
 *
 * Así, TODA partida sin IVA salía del comprobante como «no objeto de
 * impuesto». Y no son lo mismo:
 *
 *   · **Tasa 0 %** —alimentos, medicinas, exportación— es objeto de impuesto:
 *     ObjetoImp 02, TipoFactor Tasa, TasaOCuota 0.000000. Es un acto gravado.
 *   · **Exento** es objeto de impuesto y va sin tasa ni importe: ObjetoImp 02,
 *     TipoFactor Exento.
 *   · **No objeto** queda fuera del impuesto: ObjetoImp 01, sin nodo de
 *     impuestos.
 *
 * Declarar como «no objeto» una venta gravada a 0 % cambia lo que el cliente
 * puede acreditar y lo que la empresa declara al SAT. Y el catálogo de esta
 * instalación YA distingue las tres: cada impuesto lleva su `tipoFactor` y su
 * `objetoImpuesto`, y el alta manual de facturas sí los leía. Lo que no los
 * leía era el camino por el que pasan todas las ventas del punto de venta y
 * todas las notas de crédito por devolución.
 *
 * Se vio el 26-sep-2026 al ir a asignar impuestos a los productos: cuatro de
 * los siete del catálogo no tenían ninguno, y un producto sin impuesto
 * asignado también terminaba facturado como «no objeto» —inventándole una
 * postura fiscal a algo que nadie había declarado—.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que la postura fiscal salga del catálogo de impuestos y no del importe, en
 * los dos caminos; que el impuesto del producto se cargue con la venta; y que
 * facturar un producto sin impuesto asignado se niegue en vez de suponer.
 * ============================================================================
 */

const SERVICIO = join(__dirname, 'cfdi.service.ts');

describe('CFDI · gravado a cero, exento y no objeto son tres cosas distintas', () => {
  const texto = readFileSync(SERVICIO, 'utf8');
  const sinComentarios = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('la postura fiscal no se deduce del importe', () => {
    /* El patrón exacto que había, en cualquiera de sus dos formas. */
    expect(sinComentarios).not.toMatch(
      /tipoFactor:\s*tasaIVA\s*>\s*0\s*\?/,
    );
    expect(sinComentarios).not.toMatch(
      /objetoImpuesto:\s*tasaIVA\s*>\s*0\s*\?/,
    );
  });

  it('la venta y la devolución cargan el impuesto del producto', () => {
    const relaciones = [
      ...sinComentarios.matchAll(/'detalles\.producto\.impuesto'/g),
    ];
    /* Una para facturar la venta y otra para la nota de crédito. */
    expect(relaciones.length).toBeGreaterThanOrEqual(2);
  });

  it('el tipo de factor y el objeto de impuesto salen del catálogo', () => {
    const desdeCatalogo = [
      ...sinComentarios.matchAll(/impuesto\.tipoFactor\s*\?\?\s*'TASA'/g),
    ];
    expect(desdeCatalogo.length).toBeGreaterThanOrEqual(2);
  });

  it('sólo se calcula tasa cuando el factor es TASA', () => {
    const condicionada = [
      ...sinComentarios.matchAll(
        /tipoFactor === 'TASA'\s*\?\s*this\.tasaDePartida\(/g,
      ),
    ];
    expect(condicionada.length).toBeGreaterThanOrEqual(2);
  });

  it('un producto sin impuesto asignado no se factura: se dice', () => {
    expect(texto).toMatch(/nadie ha declarado qué impuesto lleva/);
    /* Y se niega con un error, no con un valor por omisión. */
    const negativas = [
      ...sinComentarios.matchAll(
        /if \(!impuesto\) \{\s*throw new BadRequestException\(/g,
      ),
    ];
    expect(negativas.length).toBeGreaterThanOrEqual(2);
  });
});
