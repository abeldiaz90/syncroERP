/**
 * ============================================================================
 * Un decimal que no dejaba arrancar
 * ----------------------------------------------------------------------------
 * `endpoints.orden_menu` es `integer` en la base —la entidad lo declara
 * `number` sin tipo explícito y TypeORM lo traduce a `int`—, y
 * `sincronizarControladoresYEndpoints()` escribe el valor de
 * `ENDPOINTS_NAVEGABLES` tal cual, dentro de `onApplicationBootstrap`.
 *
 * El 30-sep-2026 añadí una pantalla nueva y le puse `ordenMenu: 21.5` para
 * colarla entre dos renglones del menú. Lo que pasó:
 *
 *     error: invalid input syntax for type integer: "21.5"
 *     ERROR [Arranque] No se pudo iniciar la API
 *
 * `tsc` no lo ve —21.5 es un `number` perfectamente válido— y ninguna prueba lo
 * veía tampoco. El precio es el máximo que puede pagarse por un dato de
 * catálogo: **la API no levanta**. Y ocurre en el arranque, así que no hay
 * degradación ni pantalla en blanco: no hay sistema.
 *
 * Esta prueba cierra la puerta. Los empates no son el problema —ya hay varios
 * y sólo desempatan el orden del menú—; el problema es el decimal.
 * ============================================================================
 */
import { ENDPOINTS_NAVEGABLES } from './data/endpoints-navegables';

describe('El orden del menú es un entero, porque la columna lo es', () => {
  it('ningún endpoint navegable trae un orden con decimales', () => {
    const conDecimal = Object.entries(ENDPOINTS_NAVEGABLES)
      .filter(([, v]) => !Number.isInteger(v.ordenMenu))
      .map(([clave, v]) => `${clave} → ${v.ordenMenu}`);
    expect(conDecimal).toEqual([]);
  });

  it('ni negativo, ni NaN, ni infinito', () => {
    /*
     * `Number.isInteger(NaN)` es falso, así que la prueba de arriba ya los
     * atrapa; esto fija además que un orden negativo no se cuela. No rompe la
     * base —cabe en un `int`— pero pondría la pantalla delante de todo el
     * menú sin que nadie lo hubiera pedido.
     */
    for (const [clave, valor] of Object.entries(ENDPOINTS_NAVEGABLES)) {
      expect(Number.isFinite(valor.ordenMenu)).toBe(true);
      expect(valor.ordenMenu).toBeGreaterThanOrEqual(0);
      expect(typeof clave).toBe('string');
    }
  });

  it('hay endpoints de verdad que revisar (la prueba no se aprueba sola)', () => {
    expect(Object.keys(ENDPOINTS_NAVEGABLES).length).toBeGreaterThan(50);
  });

  it('la entidad sigue declarando el orden sin tipo explícito', () => {
    /*
     * Si alguien le pusiera `type: 'numeric'` a la columna, el decimal dejaría
     * de tumbar el arranque y esta prueba pasaría a prohibir algo que ya no
     * hace daño. Se ancla aquí para que ese cambio se vea: la prueba se pone
     * roja y quien lo haga decide, en lugar de dejar una regla huérfana.
     */
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const entidad = readFileSync(
      join(__dirname, 'entities', 'endpoint.entity.ts'),
      'utf8',
    );
    expect(entidad).toMatch(
      /@Column\(\{ name: 'orden_menu', default: 0 \}\)\s*ordenMenu: number;/,
    );
  });
});
