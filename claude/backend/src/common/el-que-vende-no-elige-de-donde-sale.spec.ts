import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * El que vende no elige de dónde sale ni a cuánto
 * ----------------------------------------------------------------------------
 * MEDIDO EL 29-SEP-2026, en el punto de venta, con la sesión de `empleado`
 *
 * La cabecera del punto de venta ofrecía dos desplegables idénticos y pegados,
 * sin una palabra que dijera cuál era cuál. El primero elegía DE DÓNDE SALE la
 * mercancía —el almacén, y con él las existencias que se descuentan— y el
 * segundo A CUÁNTO SE VENDE —la lista de precios—.
 *
 * Que no tuvieran etiqueta era el síntoma. El defecto es que estuvieran ahí:
 * quien atiende un mostrador no decide de qué bodega sale la pieza ni con qué
 * tarifa se cobra. Y no es una cuestión de orden, es de control:
 *
 *  · un vendedor que puede cambiar la lista de precios rebaja cualquier venta
 *    sin que quede registrado un solo descuento;
 *  · uno que puede cambiar de almacén descuadra el inventario de una bodega
 *    que no es la suya.
 *
 * Las dos salen «bien» en el ticket, y por eso ninguna de las dos se descubre
 * mirando ventas.
 *
 * LA REGLA: el contexto de venta lo configura quien administra los catálogos.
 * Al mostrador se le MUESTRA —necesita saber en qué almacén y con qué lista
 * está vendiendo— y no se le deja cambiarlo.
 *
 * Pendiente anotado: el amarre definitivo va en la CAJA —cada cuenta de caja
 * con su almacén y su lista—, porque el punto de venta ya obliga a elegir caja
 * en todo cobro de contado. Lleva migración y no se hizo el día de la entrega.
 * ============================================================================
 */

const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  // src/common → src → backend → claude, y ahí vive `frontend`.
  .map((nombre) => join(__dirname, '..', '..', '..', nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const TERMINAL = 'app/pos/terminal.tsx';

/** Quita comentarios: una prueba que mide la prosa no mide el código. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function codigoTerminal(): string {
  return sinComentarios(
    readFileSync(join(FRONTEND as string, TERMINAL), 'utf8'),
  );
}

describe('Punto de venta · el contexto de venta no lo elige quien vende', () => {
  it('encuentra la terminal', () => {
    expect(FRONTEND).toBeDefined();
    expect(existsSync(join(FRONTEND as string, TERMINAL))).toBe(true);
  });

  it('pregunta por las acciones de la sesión', () => {
    expect(codigoTerminal()).toMatch(/useAcciones\s*\(\s*\)/);
  });

  it('el almacén sólo se ofrece a quien administra almacenes', () => {
    const codigo = codigoTerminal();

    expect(codigo).toMatch(
      /puedeElegirAlmacen\s*=\s*puede\(\s*['"]POST \/catalogo\/almacenes['"]\s*\)/,
    );
    // Y el permiso gobierna de verdad el render del desplegable.
    expect(codigo).toMatch(/puedeElegirAlmacen\s*&&/);
  });

  it('la lista de precios sólo se ofrece a quien administra listas', () => {
    const codigo = codigoTerminal();

    expect(codigo).toMatch(
      /puedeElegirLista\s*=\s*puede\(\s*['"]POST \/catalogo\/listas-precio['"]\s*\)/,
    );
    expect(codigo).toMatch(/puedeElegirLista\s*&&/);
  });

  it('ningún `<select>` de contexto queda sin ese candado', () => {
    /*
     * Lo que esta prueba impide de verdad: que alguien reponga el desplegable
     * suelto, con o sin etiqueta. Se mide sobre el `<select>` que dispara
     * `cambiarContextoVenta`, que es el que cambia almacén o lista.
     */
    const codigo = codigoTerminal();
    const sueltos: string[] = [];

    const lineas = codigo.split('\n');
    lineas.forEach((linea, i) => {
      if (!/<select/.test(linea)) return;
      if (!/cambiarContextoVenta/.test(lineas.slice(i, i + 3).join('\n'))) return;

      // Las seis líneas de arriba tienen que traer el candado.
      const antes = lineas.slice(Math.max(0, i - 6), i).join('\n');
      if (!/puedeElegir(Almacen|Lista)/.test(antes)) {
        sueltos.push(`${TERMINAL}:${i + 1}`);
      }
    });

    expect(sueltos).toEqual([]);
  });

  it('a quien no puede elegir se le sigue MOSTRANDO dónde vende', () => {
    /*
     * Esconder el dato sería el otro error: quien cobra tiene que poder ver en
     * qué almacén y con qué lista está vendiendo, aunque no pueda cambiarlo.
     */
    const codigo = codigoTerminal();

    expect(codigo).toMatch(/almacenes\.find\(/);
    expect(codigo).toMatch(/listasPrecio\.find\(/);
  });
});
