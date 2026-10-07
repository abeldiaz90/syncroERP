/**
 * ============================================================================
 * Una cantidad tecleada y no confirmada no se pierde en silencio
 * ----------------------------------------------------------------------------
 * MEDIDO POR PANTALLA el 7-oct-2026, pidiendo 20 kg de café en una requisición:
 *
 *   1. Se pulsa el lápiz del renglón.
 *   2. Se teclea 20.
 *   3. Se pulsa **Enter** —que es lo que hace todo el mundo— y no pasa nada:
 *      el único modo de confirmar era una palomita.
 *   4. Se pulsa «Crear Requisición» y se manda la cantidad VIEJA.
 *
 * La requisición se creó pidiendo 1 kg en vez de 20, sin un aviso, sin un
 * resaltado, sin nada. Y de una requisición salen una cotización y una orden de
 * compra: el error se descubre cuando llega la mercancía, con el proveedor ya
 * facturando.
 *
 * Es la forma de siempre con otra ropa: la pantalla aceptó un dato, lo enseñó
 * en su campo, y lo tiró al enviar.
 *
 * LAS DOS MITADES
 *
 *   · Enter confirma y Escape descarta, porque ésas son las teclas que se
 *     pulsan en un campo que se abre para teclear un número.
 *   · Y si al enviar queda una edición abierta, **se confirma**, no se tira.
 *     Lo que la persona acaba de teclear es lo que quiere pedir.
 *
 * Verificado por pantalla las dos: con Enter el renglón pasa a «×20», y
 * dejando la edición a medias en 35 el cuerpo que sale lleva
 * `cantidadSolicitada: 35`.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const ruta = FRONTEND
  ? join(FRONTEND, 'app/dashboard/compras/requisiciones/page.tsx')
  : '';
const hay = Boolean(ruta && existsSync(ruta));
const pantalla = hay ? readFileSync(ruta, 'utf8') : '';

describe('La cantidad de un renglón de requisición', () => {
  it('la pantalla que se mide es la que está viva', () => {
    expect(hay).toBe(true);
  });

  it('se confirma con Enter', () => {
    expect(pantalla).toMatch(/if \(e\.key === 'Enter'\)/);
    expect(pantalla).toMatch(/confirmarCantidad\(idx, editCant\)/);
  });

  it('y se descarta con Escape, sin cerrar el modal entero', () => {
    /*
     * `stopPropagation`: sin él, el Escape que descarta la edición subiría y
     * cerraría también la requisición a medio capturar. Una tecla, una cosa.
     */
    expect(pantalla).toMatch(/else if \(e\.key === 'Escape'\)[\s\S]{0,120}stopPropagation\(\)/);
  });

  it('la palomita y el Enter hacen lo MISMO, por la misma función', () => {
    /*
     * Antes la palomita llevaba su propio `setDetalles(...)` escrito a mano. Dos
     * copias de la misma regla se separan: la que se toca cambia y la otra se
     * queda. Una función, dos botones.
     */
    expect(pantalla).toMatch(/const confirmarCantidad = \(idx: number, cantidad: number\) =>/);
    expect(pantalla).toMatch(/aria-label="Guardar la cantidad"[\s\S]{0,160}onClick=\{\(\) => confirmarCantidad\(idx, editCant\)\}/);
  });

  it('y al enviar, una edición abierta se confirma en vez de tirarse', () => {
    /*
     * Esto es lo que de verdad costaba dinero: el cuerpo salía con la cantidad
     * vieja. Se calcula el cuerpo a partir de lo tecleado, sin depender de que
     * el estado ya se haya actualizado —`setDetalles` no es inmediato—.
     */
    expect(pantalla).toMatch(
      /const partidas = detalles\.map\(\(d, i\) =>\s*editIdx === i && editCant > 0 \? \{ \.\.\.d, cantidadSolicitada: editCant \} : d,/,
    );
    expect(pantalla).toMatch(/detalles: partidas\.map\(/);
    // Y que ya NO se mande la lista sin confirmar.
    expect(pantalla).not.toMatch(/detalles: detalles\.map\(d => \(\{ productoId/);
  });
});
