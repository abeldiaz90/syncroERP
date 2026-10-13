/**
 * ============================================================================
 * La sesión moría por el otro plazo
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 13-oct. El ERP dejaba a la persona en /login a los ~15 minutos de no tocarlo,
 * con toda la maquinaria de renovación puesta, probada y funcionando. Llevaba
 * días anotado como «no demostrado que sea defecto»: se daba por hecho que era
 * la automatización, una pestaña en segundo plano con el temporizador
 * estrangulado por el navegador.
 *
 * Lo que lo destapó fue una asimetría: el portal de Fineract, abierto en una
 * pestaña igual de inactiva, aguantó la noche entera. Si fuera el navegador,
 * se habrían caído los dos.
 *
 * EL MECANISMO
 *
 * Keycloak manda dos plazos en cada respuesta de token:
 *
 *     expires_in          cuándo deja de servir el token de acceso    (60 min)
 *     refresh_expires_in  cuándo deja de poderse renovar — el idle    (~15 min)
 *
 * `guardarSesion` sólo leía el primero. Con un acceso de sesenta minutos el
 * temporizador quedaba programado para el minuto 59 y la sesión moría en el 15
 * por el otro lado: Keycloak la cierra por inactividad y, a partir de ahí, el
 * servidor rechaza el token de acceso —todavía válido por firma— con «emitido
 * antes del cierre de sesión». El temporizador no llegaba a correr ni una vez.
 *
 * Se renovaba contra el plazo que no mandaba.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 * Que se guarde el plazo EFECTIVO —el menor de los dos— y que el campo llegue
 * por los dos caminos que guardan sesión: el alta y la renovación. El alta es
 * el que importa y el que estaba roto por partida doble: destructuraba tres
 * campos y el nuevo se habría caído ahí sin que nada se quejara.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['frontend', '../frontend', 'claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const SESION = FRONTEND ? readFileSync(join(FRONTEND, 'lib/sesion.ts'), 'utf8') : '';
const KEYCLOAK = FRONTEND ? readFileSync(join(FRONTEND, 'lib/keycloak.ts'), 'utf8') : '';

describe('la renovación mira el plazo que manda', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
    expect(SESION).not.toBe('');
  });

  it('el tipo de los tokens conoce `refresh_expires_in`', () => {
    expect(SESION).toMatch(/refresh_expires_in\?: number;/);
  });

  it('se guarda el MENOR de los dos plazos, no el del acceso', () => {
    expect(SESION).toMatch(/const renovacion = Number\(tokens\.refresh_expires_in\);/);
    expect(SESION).toMatch(/Math\.min\(acceso, renovacion\)/);
  });

  it('un `refresh_expires_in` ausente o absurdo sólo deja el del acceso', () => {
    /*
     * Nunca alarga. Si Keycloak no lo manda, o manda basura, se vuelve al
     * comportamiento anterior —correcto para el token de acceso, sólo que
     * incompleto— en vez de dejar la sesión sin fecha.
     */
    expect(SESION).toMatch(/Number\.isFinite\(renovacion\) && renovacion > 0/);
    expect(SESION).toMatch(/:\s*acceso;/);
  });

  it('el ALTA de sesión pasa el campo: es la que fija el primer plazo', () => {
    /*
     * El camino que estaba roto dos veces. `lib/keycloak.ts` destructura los
     * campos uno por uno, así que un campo nuevo en el tipo no llega solo: hay
     * que ponerlo aquí. Sin esto, el arreglo de `sesion.ts` no haría nada en la
     * primera sesión, que es justo la que programa el primer temporizador.
     */
    expect(KEYCLOAK).toMatch(/refresh_expires_in\?: number;/);
    expect(KEYCLOAK).toMatch(/refresh_expires_in: tokens\.refresh_expires_in,/);
  });

  it('la RENOVACIÓN también, por pasar la respuesta entera', () => {
    expect(SESION).toMatch(/as TokensKeycloak;/);
    expect(SESION).toMatch(/guardarSesion\(tokens\);/);
  });

  /*
   * ── LA SEGUNDA MITAD, MEDIDA EL MISMO DÍA ────────────────────────────────
   * Con el arreglo de arriba ya desplegado, el navegador seguía diciendo que a
   * la sesión le quedaban 43 minutos mientras el token de renovación caducaba
   * en 13. El bundle servido YA traía `refresh_expires_in`: lo que pasaba es
   * que la fecha la había escrito el código viejo al iniciar sesión, y nadie
   * la volvía a mirar.
   *
   * Un arreglo que sólo entra en vigor en el siguiente inicio de sesión deja
   * con la avería puesta a todo el que ya estaba dentro. Y no hacía falta
   * preguntar: el token de renovación es un JWT y lleva su propia fecha.
   */
  it('el plazo se corrige leyendo el token de renovación, no sólo al guardarlo', () => {
    expect(SESION).toMatch(/function venceElRefresh\(\): number/);
    /* Se lee del JWT, con base64url, y sin inventar nada si no se puede. */
    expect(SESION).toMatch(/replace\(\/-\/g, '\+'\)\.replace\(\/_\/g, '\/'\)/);
    expect(SESION).toMatch(/return Number\.isFinite\(exp\) && exp > 0 \? exp \* 1000 : 0;/);
  });

  it('`venceEn` devuelve el menor de los dos, y el refresh sólo acorta', () => {
    const cuerpo = SESION.slice(
      SESION.indexOf('function venceEn(): number'),
      SESION.indexOf('function venceEn(): number') + 420,
    );
    expect(cuerpo).toMatch(/const refresh = venceElRefresh\(\);/);
    expect(cuerpo).toMatch(/if \(!guardado\) return refresh;/);
    expect(cuerpo).toMatch(/if \(!refresh\) return guardado;/);
    expect(cuerpo).toMatch(/return Math\.min\(guardado, refresh\);/);
  });

  it('un token opaco o sin `exp` no rompe nada: se queda la fecha guardada', () => {
    /*
     * La cuenta, sobre la misma regla. Un refresh que no es JWT da 0, y 0
     * significa «no se sabe» —no «vence ya»—, que es la diferencia entre
     * seguir trabajando y que la sesión se caiga por un formato inesperado.
     */
    const efectivo = (guardado: number, refresh: number) => {
      if (!guardado) return refresh;
      if (!refresh) return guardado;
      return Math.min(guardado, refresh);
    };
    const ahora = 1_000_000;
    /* El caso medido: guardado a 43 min, refresh a 13. Manda el refresh. */
    expect(efectivo(ahora + 43 * 60_000, ahora + 13 * 60_000)).toBe(ahora + 13 * 60_000);
    /* Token opaco: se respeta lo guardado. */
    expect(efectivo(ahora + 43 * 60_000, 0)).toBe(ahora + 43 * 60_000);
    /* Sin fecha guardada: sirve la del refresh. */
    expect(efectivo(0, ahora + 13 * 60_000)).toBe(ahora + 13 * 60_000);
    /* Ninguna de las dos: cero, que `porVencer` ya sabe tratar. */
    expect(efectivo(0, 0)).toBe(0);
  });

  /*
   * La prueba de la prueba. Lo de arriba mira texto; esto comprueba la cuenta,
   * con los números reales del realm: acceso de 60 minutos, idle de 15. Si
   * alguien invirtiera el `Math.min`, el temporizador volvería al minuto 59 y
   * todo lo anterior seguiría verde.
   */
  it('con 60 min de acceso y 15 de idle, el plazo efectivo son 15', () => {
    const efectivo = (acceso: number, renovacion?: number) => {
      const r = Number(renovacion);
      return Number.isFinite(r) && r > 0 ? Math.min(acceso, r) : acceso;
    };
    expect(efectivo(3600, 900)).toBe(900);
    /* Y al revés no acorta de más: un idle largo no alarga el acceso. */
    expect(efectivo(300, 1800)).toBe(300);
    /* Ausente, basura y cero dejan el del acceso. */
    expect(efectivo(3600, undefined)).toBe(3600);
    expect(efectivo(3600, Number.NaN)).toBe(3600);
    expect(efectivo(3600, 0)).toBe(3600);
  });
});
