import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Una mercancía que ya salió tiene que poder entrar
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, medido el 26-sep-2026 con TRF-20260926062652-246EF8
 *
 * La transferencia se solicitó, se autorizó, se envió —y el envío ASIENTA la
 * salida del almacén de origen— y al recibirla en la posición N-01-01 del
 * almacén destino el servicio contestaba:
 *
 *   400 «Termo de acero 1 L: primero asigna el producto a la ubicación
 *        N-01-01.»
 *
 * La pantalla de recepción ofrece todas las posiciones DISPONIBLES del almacén
 * destino. Ninguna servía: el producto nunca había estado en ese almacén, así
 * que no existía su registro en `producto_ubicaciones` y CUALQUIER opción de la
 * lista devolvía ese 400. Un desplegable en el que todas las opciones fallan.
 *
 * Y lo grave no es el desplegable: la salida ya estaba asentada. La mercancía
 * se quedaba EN_TRANSITO —fuera del almacén que la mandó, sin llegar al que la
 * esperaba— sin ninguna manera de cerrarla desde el sistema. Lo mismo bloqueaba
 * la recepción de una compra en cualquier posición nueva, porque es la misma
 * función: `InventarioService.registrarCompra`.
 *
 * POR QUÉ ERA UN DEFECTO Y NO UN CONTROL
 *
 * `producto_ubicaciones` es SLOTTING: posición principal, capacidad asignada,
 * mínimos y máximos. Ninguna de sus columnas dice «este producto no puede estar
 * aquí». Se estaba usando una tabla de sugerencias como reja. Lo que sí impide
 * guardar en una posición —su ESTADO (bloqueada, embarque) y su CAPACIDAD— se
 * comprueba aparte y se queda.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que la entrada a una posición nueva cree el registro de slotting en lugar de
 * rechazar la mercancía. Si alguien vuelve a poner el `throw`, esta prueba lo
 * dice antes de que una transferencia se quede en el aire.
 * ============================================================================
 */

const FUENTE = readFileSync(
  join(__dirname, 'inventario.service.ts'),
  'utf8',
);

/** El cuerpo del `if (ubicacionId) { … }` de la entrada de mercancía. */
function bloqueDeUbicacion(texto: string): string {
  const inicio = texto.indexOf('if (ubicacionId) {');
  expect(inicio).toBeGreaterThan(-1);
  let nivel = 0;
  for (let i = texto.indexOf('{', inicio); i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(inicio, i + 1);
    }
  }
  return '';
}

/** El mismo texto sin comentarios: un defecto citado no es un defecto. */
const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('Entrada de mercancía · la posición nueva no rechaza la mercancía', () => {
  const bloque = sinComentarios(bloqueDeUbicacion(FUENTE));

  it('no exige un slotting previo para recibir en una posición', () => {
    expect(bloque).not.toMatch(/primero asigna el producto a la ubicaci/i);
    expect(bloque).not.toMatch(/if\s*\(\s*!asignacion\s*\)\s*throw/);
  });

  it('crea el registro producto-posición cuando falta', () => {
    expect(bloque).toMatch(/em\.create\(\s*ProductoUbicacion/);
    // Creada por un movimiento, no por una decisión de slotting: no principal.
    expect(bloque).toMatch(/esPrincipal:\s*false/);
  });

  it('sigue comprobando lo que de verdad impide guardar ahí', () => {
    // El estado de la posición.
    expect(bloque).toMatch(/EstadoUbicacionAlmacen\.BLOQUEADA/);
    expect(bloque).toMatch(/EstadoUbicacionAlmacen\.EMBARQUE/);
    // Y su capacidad.
    expect(bloque).toMatch(/excederí?a su capacidad/i);
  });

  it('la posición sigue teniendo que existir y ser del almacén', () => {
    expect(bloque).toMatch(
      /no existe, está inactiva o no pertenece al almacén seleccionado/,
    );
  });
});
