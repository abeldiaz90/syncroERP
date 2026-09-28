import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * La que cotizó más caro no es una rechazada
 * ----------------------------------------------------------------------------
 * La entidad lo dice con todas sus letras, y no es una sutileza de nombres:
 *
 *   «a una propuesta rechazada alguien le dijo que no, con motivo y con
 *    nombre; una descartada simplemente no fue la elegida. Confundirlas deja
 *    al proveedor marcado como reprobado cuando sólo cotizó más caro, y es la
 *    primera pregunta que se hace cuando alguien audita por qué se adjudicó a
 *    otro.»
 *
 * MEDIDO EL 28-SEP-2026, por pantalla, sobre REQ-0C5BE1A8
 *
 * Al FIRMAR la adjudicación de Proveedor A, el ERP marcó a Proveedor B como
 * DESCARTADA. Correcto: nadie lo rechazó, sólo cotizó $90 más caro.
 *
 * Al GENERAR LA ORDEN, la misma propuesta pasó a RECHAZADA. La pantalla, que
 * lee ese estado, cambió de mostrar «DESCARTADA» a mostrar «Adjudicación
 * rechazada» y además le ofreció al comprador un botón de «Reenviar a
 * aprobación» sobre una requisición que ya estaba en ORDEN_GENERADA.
 *
 * O sea: el paso de aprobación distinguía bien y el de generación de orden lo
 * deshacía, porque barría a TODAS las hermanas que no fueran SELECCIONADA con
 * un `set({ estado: 'RECHAZADA' })`.
 *
 * Y de paso pisaba a las que SÍ habían sido rechazadas de verdad —con nombre,
 * motivo y fecha—, que no hay que volver a tocar: ya tienen su historia.
 *
 * LA REGLA: al generar la orden, las que seguían en juego se DESCARTAN. Las
 * rechazadas se quedan rechazadas. La elegida, SELECCIONADA.
 * ============================================================================
 */

const FUENTE = readFileSync(
  join(__dirname, 'ordenes-compra.service.ts'),
  'utf8',
);

/**
 * El `UPDATE` que barre a las hermanas al generar la orden, SIN el comentario
 * que lo explica: ese comentario nombra a propósito el estado viejo, y medirlo
 * castigaría justamente al que dejó escrito por qué se cambió.
 */
function barridoDeHermanas(): string {
  const ancla = FUENTE.indexOf("cotizacion.estado = 'SELECCIONADA'");
  expect(ancla).toBeGreaterThan(-1);
  const update = FUENTE.indexOf('.update(Cotizacion)', ancla);
  expect(update).toBeGreaterThan(-1);
  return FUENTE.slice(update, FUENTE.indexOf('.execute();', update) + 11);
}

describe('Órdenes de compra · qué pasa con las propuestas que no ganaron', () => {
  it('a las que seguían en juego se las DESCARTA, no se las rechaza', () => {
    expect(barridoDeHermanas()).toMatch(/set\(\{\s*estado:\s*'DESCARTADA'/);
  });

  it('no se marca a nadie como RECHAZADA en ese barrido', () => {
    /*
     * Rechazar es un acto de una persona, con motivo y con nombre. Un `UPDATE`
     * masivo no puede firmarlo.
     */
    expect(barridoDeHermanas()).not.toMatch(/set\(\{\s*estado:\s*'RECHAZADA'/);
  });

  it('no pisa a las que ya habían sido rechazadas de verdad', () => {
    /*
     * Ésas ya tienen su historia —quién dijo que no, cuándo y por qué—. El
     * barrido sólo alcanza a las que seguían en juego.
     */
    const barrido = barridoDeHermanas();
    expect(barrido).toMatch(/RECHAZADA/);
    expect(barrido).toMatch(/NOT IN|<>\s*:seleccionada|estado NOT IN/);
  });

  it('la elegida queda SELECCIONADA', () => {
    expect(FUENTE).toMatch(/cotizacion\.estado = 'SELECCIONADA'/);
  });
});
