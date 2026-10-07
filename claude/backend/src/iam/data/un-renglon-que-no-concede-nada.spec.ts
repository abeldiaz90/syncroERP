import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { normalizarParametrosDeRuta } from './endpoints-navegables';
import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

/**
 * ============================================================================
 * Un renglon declarado tiene que conceder algo
 * ----------------------------------------------------------------------------
 * `accionesIrrenunciables` y `accionesVedadas` se comparan contra la tabla de
 * endpoints por cadena exacta —`metodo + ruta`— y, cuando no encuentran la
 * fila, siguen de largo:
 *
 *     const ep = porClave.get(accion);
 *     if (!ep) continue;
 *
 * Callar ahi es correcto: un endpoint apagado no debe tumbar el arranque. Pero
 * significa que **una accion mal escrita no concede nada y no se queja**. El
 * renglon queda en la plantilla, con su comentario explicando el 403 que venia
 * a arreglar, y el 403 sigue igual que antes.
 *
 * Hay dos maneras de escribirla mal, y las dos se ven igual de bien:
 *
 *   1. La ruta no existe —un modulo que se movio, una letra de mas—.
 *   2. La ruta existe pero se nombra el parametro como lo nombra el
 *      controlador. La tabla **normaliza todo parametro a `:id`**
 *      (`normalizarParametrosDeRuta`), asi que
 *      `POST /credito/cobranza/pago/:pagoId/cancelar` no encuentra su fila,
 *      aunque el controlador la declare exactamente asi.
 *
 * El segundo es el que no se adivina leyendo: la cadena *parece* mas correcta
 * cuanto mas se parece al controlador, y es justo al reves.
 *
 * QUE CUIDA ESTA PRUEBA
 *
 * Que cada accion declarada —concedida o vedada— corresponda a una ruta que
 * existe de verdad en algun controlador del arbol, escrita en la forma que la
 * tabla usa. No comprueba que el permiso sea el acertado: comprueba que el
 * renglon haga algo.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

/** Las rutas de los controladores, normalizadas como las guarda la tabla. */
function rutasDeControladores(raiz: string): Set<string> {
  const rutas = new Set<string>();
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const camino = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(camino);
        continue;
      }
      if (!entrada.name.endsWith('.controller.ts')) continue;
      const texto = readFileSync(camino, 'utf8');
      const prefijo = texto.match(/@Controller\(\s*['"`]([^'"`]*)['"`]/);
      const base = prefijo ? prefijo[1].replace(/^\/|\/$/g, '') : '';
      for (const m of texto.matchAll(
        /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g,
      )) {
        const metodo = m[1].toUpperCase();
        const sub = (m[2] ?? '').replace(/^\/|\/$/g, '');
        const ruta = `/${[base, sub].filter(Boolean).join('/')}`;
        rutas.add(`${metodo} ${normalizarParametrosDeRuta(ruta)}`);
      }
    }
  };
  recorrer(raiz);
  return rutas;
}

const declaradas = PLANTILLAS_PERMISOS.flatMap((plantilla) =>
  [
    ...(plantilla.accionesIrrenunciables ?? []),
    ...(plantilla.accionesVedadas ?? []),
  ].map((accion) => ({ rol: plantilla.rol, accion })),
);

describe('Plantillas de permisos · un renglon declarado concede algo', () => {
  if (!existsSync(join(SRC, 'iam'))) {
    it('sin arbol de backend, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const rutas = rutasDeControladores(SRC);

  it('el barrido encuentra los controladores', () => {
    /* Un numero bajo aqui seria un detector mirando al sitio equivocado. */
    expect(rutas.size).toBeGreaterThan(400);
  });

  it('hay acciones declaradas que comprobar', () => {
    expect(declaradas.length).toBeGreaterThan(80);
  });

  it('cada accion declarada corresponde a una ruta que existe', () => {
    const huerfanas = declaradas
      .filter(({ accion }) => !rutas.has(accion))
      .map(({ rol, accion }) => `${rol} → ${accion}`);
    expect(huerfanas.sort()).toEqual([]);
  });

  it('ninguna accion nombra el parametro como lo nombra el controlador', () => {
    /*
     * La forma de fallar que no se ve leyendo. `:pagoId` es el nombre de
     * verdad y por eso parece mejor; la tabla guarda `:id` y esa fila no
     * existiria. Se comprueba sobre la cadena, no contra los controladores:
     * asi se queja aunque la ruta ya no exista por otro motivo.
     */
    const conNombrePropio = declaradas
      .filter(({ accion }) => {
        const [metodo, ...resto] = accion.split(' ');
        const ruta = resto.join(' ');
        return normalizarParametrosDeRuta(ruta) !== ruta && Boolean(metodo);
      })
      .map(({ rol, accion }) => `${rol} → ${accion}`);
    expect(conNombrePropio.sort()).toEqual([]);
  });

  it('el normalizador sigue siendo el que aplana a :id', () => {
    /*
     * La prueba de la prueba: si el normalizador cambiara de criterio, las
     * dos comprobaciones de arriba pasarian a medir otra cosa sin decirlo.
     */
    expect(normalizarParametrosDeRuta('/credito/cobranza/pago/:pagoId/cancelar')).toBe(
      '/credito/cobranza/pago/:id/cancelar',
    );
    expect(normalizarParametrosDeRuta('/ventas/clientes/:clienteId/saldo-favor')).toBe(
      '/ventas/clientes/:id/saldo-favor',
    );
  });
});
