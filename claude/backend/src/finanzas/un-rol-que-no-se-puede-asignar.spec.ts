import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { RolCuentaSistema } from './entities/cuenta-contable.entity';

/**
 * ============================================================================
 * UN ROL QUE NO SE PUEDE ASIGNAR ES UN ROL QUE NO EXISTE
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * El cierre del ejercicio exige una cuenta marcada con el rol
 * `RESULTADO_EJERCICIO_UTILIDAD`, y su pantalla lo dice con todas sus letras:
 * «asígnale ese rol de sistema a la cuenta de capital correspondiente en el
 * catálogo contable».
 *
 * En el catálogo contable no estaba en la lista. El desplegable ofrecía trece
 * roles de los veinte que el servidor acepta, así que la instrucción mandaba a
 * un sitio donde la acción era imposible. Un callejón sin salida perfecto: el
 * módulo entero quedaba inusable y nada fallaba.
 *
 * El servidor lo habría aceptado —el DTO admite cualquier valor del enum—, así
 * que ninguna prueba de servidor podía verlo. Lo vio el primer recorrido por
 * el navegador, el 12-oct-2026.
 *
 * LA REGLA
 *
 * Todo rol de sistema que el servidor reconoce tiene que poder asignarse desde
 * la pantalla. Si alguno no debe ofrecerse, se declara abajo con su razón: una
 * ausencia explicada es una decisión; una ausencia callada es este defecto.
 * ============================================================================
 */

const FRONTEND = (() => {
  const ruta = join(__dirname, '../../../frontend');
  return existsSync(ruta) ? ruta : null;
})();

/**
 * Los que a propósito no se ofrecen, con su razón.
 *
 * Hoy está vacío, y el porqué vale la pena escribirlo porque me equivoqué
 * aquí: el enum tiene dos ALIAS DE CLAVE —`IVA_TRASLADADO` apunta al mismo
 * *valor* que `IVA_TRASLADADO_COBRADO`, y `IVA_ACREDITABLE` al de
 * `IVA_ACREDITABLE_PAGADO`—. `Object.values()` devuelve valores, no claves,
 * así que esos dos nombres NUNCA aparecen en el barrido y declararlos como
 * excepción sobraba.
 *
 * Lo cazó la segunda prueba de este mismo archivo, que es exactamente para lo
 * que existe: una lista de excepciones que se queda con nombres que ya no son
 * nada es una lista que nadie vuelve a leer.
 *
 * El mecanismo se queda para el día que haga falta: una ausencia explicada es
 * una decisión; una ausencia callada es el defecto que esta prueba persigue.
 */
const NO_SE_OFRECEN: Record<string, string> = {};

describe('un rol de sistema que no se puede asignar', () => {
  it('cada rol que el servidor reconoce se ofrece en el catálogo contable', () => {
    if (!FRONTEND) return;
    const pantalla = readFileSync(
      join(FRONTEND, 'app/dashboard/finanzas/cuentas-contables/page.tsx'),
      'utf8',
    );

    /* La prueba de la prueba: si la lista cambia de forma y deja de
       encontrarse, esto no puede quedarse verde sin haber mirado nada. */
    expect(pantalla).toContain('ROLES_SISTEMA');

    const faltantes = Object.values(RolCuentaSistema)
      .filter((rol) => !NO_SE_OFRECEN[rol])
      .filter((rol) => !pantalla.includes(`"${rol}"`));

    expect(faltantes.sort()).toEqual([]);
  });

  it('cada ausencia declarada sigue existiendo y sigue explicada', () => {
    const valores = new Set<string>(Object.values(RolCuentaSistema));
    const huerfanas = Object.keys(NO_SE_OFRECEN).filter((r) => !valores.has(r));
    expect(huerfanas).toEqual([]);

    const sinRazon = Object.entries(NO_SE_OFRECEN)
      .filter(([, razon]) => String(razon).trim().length < 15)
      .map(([rol]) => rol);
    expect(sinRazon).toEqual([]);
  });

  it('el cierre del ejercicio nombra un rol que de verdad existe', () => {
    /*
     * El mensaje del impedimento manda al catálogo a asignar «Resultado del
     * ejercicio». Si alguien renombra el rol y no toca el mensaje, la
     * instrucción manda a buscar algo que ya no se llama así.
     */
    expect(Object.values(RolCuentaSistema)).toContain(
      'RESULTADO_EJERCICIO_UTILIDAD',
    );
    const servicio = readFileSync(
      join(__dirname, 'services/cierre-anual.service.ts'),
      'utf8',
    );
    expect(servicio).toContain('RESULTADO_EJERCICIO_UTILIDAD');
  });
});
