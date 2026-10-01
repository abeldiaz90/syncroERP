/**
 * ============================================================================
 * La caja no ofrece lo que el servidor va a rechazar
 * ----------------------------------------------------------------------------
 * El punto de venta dibujaba un campo «Desc. $» por renglón. El cajero lo
 * teclea, el carrito se recalcula en pantalla, el cliente ve el importe nuevo
 * — y al cobrar el servidor contesta 403, porque el tope del rol `empleado` es
 * cero. El «no» llegaba con el cliente ya en el mostrador.
 *
 * El arreglo es el de cualquier POS serio: la pantalla PREGUNTA el tope antes
 * de dibujar el campo (`GET /ventas/tope-descuento`), y si es cero no hay
 * campo, sino una línea que dice por dónde sí se baja un precio en este ERP.
 * El `throw` del servidor sigue ahí, pero deja de ser la primera noticia.
 *
 * Esta prueba cuida las tres piezas: que el endpoint exista y conteste lo que
 * dice la política, que esté DECLARADO para el mostrador —no heredado—, y que
 * la pantalla lo consulte y acote contra él en vez de contra el importe.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { VentasController } from './controllers/ventas.controller';
import { PLANTILLAS_PERMISOS } from '../iam/data/plantillas-permisos';

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const terminal = FRONTEND ? join(FRONTEND, 'app/pos/terminal.tsx') : '';
const hayPantalla = Boolean(terminal && existsSync(terminal));
const pantalla = hayPantalla ? readFileSync(terminal, 'utf8') : '';
const pantallaSinComentarios = pantalla
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\/[^\n]*/g, '');

/** El controlador no toca base de datos para esto: se instancia sin servicios. */
const controlador = new VentasController(
  null as never,
  null as never,
  null as never,
);

describe('La caja pregunta cuánto puede descontar', () => {
  it('el mostrador recibe cero, que es la política de hoy', () => {
    expect(controlador.topeDescuento('empleado')).toEqual({
      topePorcentaje: 0,
      puedeDescontar: false,
    });
  });

  it('quien sí tiene autorizado descontar recibe su número', () => {
    expect(controlador.topeDescuento('gerencia')).toEqual({
      topePorcentaje: 10,
      puedeDescontar: true,
    });
    expect(controlador.topeDescuento('direccion')).toEqual({
      topePorcentaje: 20,
      puedeDescontar: true,
    });
  });

  it('sin rol no se inventa un tope', () => {
    expect(controlador.topeDescuento(undefined)).toEqual({
      topePorcentaje: 0,
      puedeDescontar: false,
    });
  });

  it('`puedeDescontar` es el mismo hecho que el número, no otro dato', () => {
    /*
     * Dos campos que pueden contradecirse son dos fuentes de verdad. Aquí el
     * booleano se deriva; esta prueba muere si alguien lo escribe a mano.
     */
    for (const rol of ['empleado', 'gerencia', 'direccion', 'contador']) {
      const r = controlador.topeDescuento(rol);
      expect(r.puedeDescontar).toBe(r.topePorcentaje > 0);
    }
  });
});

describe('La consulta del tope está declarada para el mostrador', () => {
  const mostrador = PLANTILLAS_PERMISOS.find((p) => p.rol === 'empleado');

  it('es irrenunciable, no heredada del módulo `ventas`', () => {
    expect(mostrador?.accionesIrrenunciables ?? []).toContain(
      'GET /ventas/tope-descuento',
    );
  });

  it('y no está vedada, que es como se deshace una irrenunciable en silencio', () => {
    expect(mostrador?.accionesVedadas ?? []).not.toContain(
      'GET /ventas/tope-descuento',
    );
  });
});

describe('La pantalla del mostrador respeta el tope', () => {
  it('consulta el tope al abrir', () => {
    if (!hayPantalla) return;
    expect(pantallaSinComentarios).toContain("'/ventas/tope-descuento'");
  });

  it('si la consulta falla, asume cero: no ofrece lo que no sabe si puede', () => {
    if (!hayPantalla) return;
    expect(pantallaSinComentarios).toMatch(
      /tope-descuento'\)\s*,\s*\{\s*topePorcentaje:\s*0\s*\}/,
    );
  });

  it('acota el descuento contra el tope, no contra el importe del renglón', () => {
    if (!hayPantalla) return;
    expect(pantallaSinComentarios).toMatch(
      /const descuentoMaximoDe[\s\S]{0,260}importe\s*\*\s*tope\)\s*\/\s*100/,
    );
    /* Y el acotado vive en el estado, no sólo en el atributo `max`. */
    expect(pantallaSinComentarios).toMatch(
      /descuento:\s*Math\.min\(Math\.max\(0,\s*n\(val\)\),\s*descuentoMaximoDe\(i\)\)/,
    );
  });

  it('con tope cero el campo no se dibuja', () => {
    if (!hayPantalla) return;
    expect(pantallaSinComentarios).toMatch(
      /\{n\(topeDescuento\)>0\s*&&\s*\(/,
    );
  });

  it('y la desaparición del campo se explica, en lugar de dejar un hueco', () => {
    if (!hayPantalla) return;
    expect(pantallaSinComentarios).toMatch(/topeDescuento===0\s*&&\s*\(/);
    expect(pantalla).toMatch(/lista de precios vigente/);
    expect(pantalla).toMatch(/no aplica\s*\n?\s*descuentos en caja/);
  });

  it('mientras no se sabe el tope tampoco se ofrece el campo', () => {
    /*
     * `null` como estado inicial y `n(null) === 0`: un campo que aparece medio
     * segundo después, y que quizá no debía estar, es peor que uno que tarda.
     */
    if (!hayPantalla) return;
    expect(pantallaSinComentarios).toMatch(
      /useState<number\|null>\(null\)/,
    );
  });
});
