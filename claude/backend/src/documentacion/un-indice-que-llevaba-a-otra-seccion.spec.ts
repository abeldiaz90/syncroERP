/**
 * ============================================================================
 * Un índice que llevaba a otra sección
 * ----------------------------------------------------------------------------
 * Reportado por Abel el 1-oct-2026 desde la consola del navegador, abriendo la
 * ayuda del ERP:
 *
 *     Encountered two children with the same key, `los-pasos`.
 *     Encountered two children with the same key, `que-te-va-a-negar-el-sistema`.
 *
 * El aviso de React es el síntoma menor —una lista con llaves repetidas— y es
 * tentador callarlo poniendo la posición en la `key`. Eso habría dejado el
 * defecto intacto.
 *
 * Lo que pasaba de verdad: `anclaDe()` sólo depende del texto del encabezado,
 * así que dos secciones con el mismo título producían el mismo `id`. En el
 * manual de curso «Los pasos» y «¿Qué te va a negar el sistema?» se repiten
 * una vez por rol. Un `id` repetido es HTML inválido y el navegador salta
 * siempre al primero: **quien hacía clic en «Los pasos» de Compras acababa
 * leyendo «Los pasos» de Ventas**, sin un solo aviso de que se había movido de
 * sección.
 *
 * Y es de los que no se notan desde fuera: el enlace funciona, la página se
 * desplaza, aparece un encabezado con el título correcto. Sólo el contenido
 * está mal, y quien está aprendiendo a usar el sistema no tiene con qué
 * sospecharlo. Es el mismo modo de fallo que la tarjeta del kardex y el total
 * del catálogo: una respuesta verosímil a otra pregunta.
 *
 * El arreglo va en el renderizado, no en la pantalla, porque es el único punto
 * donde el `id` del encabezado y la entrada del índice salen del mismo valor.
 * ============================================================================
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { anclaDe, renderizar } from './markdown';

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const DOC = [
  '# Manual',
  '',
  '## Compras',
  '',
  '### Los pasos',
  '',
  'Primero esto.',
  '',
  '## Ventas',
  '',
  '### Los pasos',
  '',
  'Después lo otro.',
  '',
  '### ¿Qué te va a negar el sistema?',
  '',
  'Nada.',
  '',
  '## Almacén',
  '',
  '### Los pasos',
  '',
  'Y al final.',
].join('\n');

describe('Cada sección tiene su propia ancla', () => {
  const { html, indice } = renderizar(DOC, []);

  it('no hay dos `id` iguales en el documento', () => {
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(3);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ni dos entradas del índice apuntando al mismo sitio', () => {
    /*
     * Esto es lo que React reportaba. Importa por sí mismo: la lista lateral se
     * dibuja con el ancla como llave, y dos llaves iguales dejan a React sin
     * poder distinguir dos elementos.
     */
    const anclas = indice.map((e) => e.ancla);
    expect(new Set(anclas).size).toBe(anclas.length);
  });

  it('la primera conserva el ancla limpia', () => {
    /*
     * Para que los enlaces que ya existan —en otro documento, en un correo, en
     * un marcador— sigan sirviendo. Renumerar desde `-1` habría roto todos los
     * enlaces del sistema para arreglar los repetidos.
     */
    expect(indice.filter((e) => e.texto === 'Los pasos')[0].ancla).toBe(
      'los-pasos',
    );
  });

  it('y las repetidas se numeran en orden de aparición', () => {
    const pasos = indice
      .filter((e) => e.texto === 'Los pasos')
      .map((e) => e.ancla);
    expect(pasos).toEqual(['los-pasos', 'los-pasos-2', 'los-pasos-3']);
  });

  it('cada entrada del índice apunta a un encabezado que existe', () => {
    /*
     * La prueba que de verdad cierra el agujero: no basta con que las anclas
     * sean distintas entre sí, tienen que coincidir con los `id` que se
     * escribieron en el HTML. Si el índice se numerara por su cuenta y los
     * encabezados por la suya, las dos listas serían únicas y ninguna llevaría
     * a ningún lado.
     */
    const ids = new Set(
      [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
    );
    for (const entrada of indice) {
      expect([entrada.texto, ids.has(entrada.ancla)]).toEqual([
        entrada.texto,
        true,
      ]);
    }
  });

  it('y lleva al encabezado DE SU sección, no al primero que se parezca', () => {
    /*
     * El defecto, dicho como lo vive quien lee: el segundo «Los pasos» tiene
     * que llevar al que está debajo de «Ventas».
     */
    const segundo = indice.filter((e) => e.texto === 'Los pasos')[1].ancla;
    const posicionAncla = html.indexOf(`id="${segundo}"`);
    const posicionVentas = html.indexOf('id="ventas"');
    const posicionAlmacen = html.indexOf('id="almacen"');
    expect(posicionAncla).toBeGreaterThan(posicionVentas);
    expect(posicionAncla).toBeLessThan(posicionAlmacen);
  });
});

describe('El acento y la puntuación no cambian', () => {
  it('«¿Qué te va a negar el sistema?» sigue dando la misma ancla de siempre', () => {
    /*
     * El ancla ya existía así y hay enlaces escritos a mano apuntando a ella.
     * Este arreglo era sobre la repetición, no sobre la forma.
     */
    expect(anclaDe('¿Qué te va a negar el sistema?')).toBe(
      'que-te-va-a-negar-el-sistema',
    );
  });
});

describe('Se resolvió donde salen los dos valores, no en la pantalla', () => {
  const markdown = sinComentarios(
    readFileSync(join(__dirname, 'markdown.ts'), 'utf8'),
  );

  it('el renderizado lleva la cuenta de las anclas usadas', () => {
    expect(markdown).toMatch(/const anclasUsadas = new Map<string, number>\(\);/);
    expect(markdown).toMatch(/const ancla = anclaUnica\(texto\);/);
  });

  it('`anclaDe` se quedó pura: sigue dependiendo sólo del texto', () => {
    /*
     * Es exportada y la usan otros. Meterle estado la habría vuelto dependiente
     * del orden de las llamadas, y entonces dos documentos renderizados en la
     * misma petición se contaminarían entre sí.
     */
    const cuerpo = markdown.slice(
      markdown.indexOf('export function anclaDe'),
      markdown.indexOf('function celdasDe'),
    );
    expect(cuerpo).not.toMatch(/anclasUsadas|Map|let |global/);
  });

  it('el contador nace con cada documento', () => {
    /*
     * Si viviera en el ámbito del módulo, el segundo documento que se
     * renderizara arrancaría con las anclas del primero ya ocupadas y le
     * pondría `-2` a secciones que no se repiten.
     */
    const dosVeces = [renderizar(DOC, []), renderizar(DOC, [])];
    expect(dosVeces[0].indice.map((e) => e.ancla)).toEqual(
      dosVeces[1].indice.map((e) => e.ancla),
    );
  });
});
