import { readFileSync } from 'fs';
import { join } from 'path';
import { PLANTILLAS_PERMISOS } from './data/plantillas-permisos';

/**
 * ============================================================================
 * Los roles del ERP, declarados en el realm
 * ----------------------------------------------------------------------------
 * QUÉ ES ESTO
 *
 * `npm run keycloak:roles` declara en Keycloak un rol de realm por cada
 * plantilla del ERP, con el prefijo `erp:`. Es el paso 1 del plan, y es **lo
 * único de todo el plan que no cambia el comportamiento de nada**: el ERP sigue
 * leyendo el rol de la ficha, como hasta hoy. El realm queda listo; el día que
 * se decida leerlo, ya está.
 *
 * (El paso 2 —que el ERP lea el rol del token— está escrito y guardado sin
 * aplicar. La corrección del 10 de octubre en la propuesta explica por qué no
 * antes de producción: vive en `jwt.strategy.ts`, por donde pasa toda petición
 * de todo el mundo, y el beneficio real resultó ser menor de lo que yo mismo
 * había escrito.)
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Lo que se puede comprobar sin un Keycloak delante, que es casi todo lo que
 * importa: que la lista de roles salga de las plantillas y no de una copia
 * escrita a mano, que el guion no borre nunca, y que mirar sea lo que hace por
 * omisión.
 *
 * Lo que NO se puede comprobar aquí es la conversación con el realm. Eso lo
 * dice el propio guion al correr, y por eso informa antes de tocar: si la
 * cuenta de servicio no tiene «manage-realm», se para **antes** de crear el
 * primero, en vez de reventar a mitad con la mitad hechos.
 * ============================================================================
 */

const GUION = readFileSync(
  join(__dirname, '..', '..', 'scripts', 'keycloak-roles.ts'),
  'utf8',
);

describe('los roles del ERP en el realm', () => {
  it('la lista sale de las plantillas, no de una copia escrita a mano', () => {
    /*
     * Una lista paralela envejece: el día que nazca el rol catorce, el realm se
     * quedaría sin él y nadie lo notaría hasta que alguien no pudiera entrar.
     */
    expect(GUION).toMatch(
      /PLANTILLAS_PERMISOS\.map\(\(p\) => `\$\{PREFIJO_ROL_ERP\}\$\{p\.rol\}`\)/,
    );
    expect(PLANTILLAS_PERMISOS.length).toBeGreaterThanOrEqual(13);
  });

  it('el administrador se declara aparte, porque no tiene plantilla', () => {
    /*
     * No la necesita —atraviesa los tres controles— pero sí es un rol del
     * sistema, y tiene que existir donde se administra todo lo demás.
     */
    expect(PLANTILLAS_PERMISOS.some((p) => p.rol === 'administrador')).toBe(false);
    expect(GUION).toMatch(/esperados\.push\(`\$\{PREFIJO_ROL_ERP\}administrador`\)/);
  });

  it('no borra nunca, ni lo que sobra', () => {
    /*
     * El `sobran` se calcula y se enseña, y ahí se queda. Un rol de realm puede
     * estar asignado a cien personas, y borrarlo se lo quita a todas en
     * silencio: eso es una decisión con nombre y apellido, no un efecto
     * colateral de poner al día una lista.
     */
    expect(GUION).toMatch(/const sobran = /);
    expect(GUION).toMatch(/No se borran\./);
    expect(GUION).not.toMatch(/axios\.delete/);
  });

  it('mirar es lo que hace por omisión; crear hay que pedirlo', () => {
    expect(GUION).toMatch(/const CREAR = process\.argv\.includes\('--crear'\)/);
    expect(GUION).toMatch(/no se ha tocado nada/);
  });

  it('comprueba el permiso ANTES de crear el primero', () => {
    /*
     * La alternativa es un 403 a mitad de camino, con unos roles creados y
     * otros no, y un realm en un estado que nadie pidió.
     */
    const antes = GUION.slice(0, GUION.indexOf('/* ── Lo que ya hay'));
    expect(antes).toMatch(/if \(CREAR && !puedeCrear\)/);
    expect(antes).toMatch(/manage-realm/);
    expect(antes).toMatch(/No se intenta nada/);
  });

  it('los permisos se leen del propio token, que es lo que mirará Keycloak', () => {
    /*
     * El mismo criterio que ya sigue el diagnóstico del directorio en el ERP.
     * Preguntar por otra vía contestaría sobre otra cosa.
     */
    expect(GUION).toMatch(/resource_access\?\.\['realm-management'\]/);
  });

  it('un 409 al crear no es un fallo', () => {
    /* Es la carrera benigna: alguien lo creó entre la lectura y la escritura. */
    expect(GUION).toMatch(/status === 409/);
    expect(GUION).toMatch(/ya existía/);
  });

  it('el informe del realm no cambia nada, y lo dice', () => {
    /*
     * Cuánto dura la sesión y en qué idioma se ve el acceso tocan a todo el
     * mundo a la vez: acortar `ssoSessionMaxLifespan` echa fuera a quien esté
     * trabajando. Se leen y se explican; cambiarlos es a mano y mirando.
     */
    expect(GUION).toMatch(/ssoSessionIdleTimeout/);
    expect(GUION).toMatch(/ssoSessionMaxLifespan/);
    expect(GUION).toMatch(/internationalizationEnabled/);
    expect(GUION).toMatch(/Nada de esto se cambia desde aquí/);
    const informe = GUION.slice(
      GUION.indexOf('async function informarDelRealm'),
      GUION.indexOf('async function main'),
    );
    expect(informe).not.toMatch(/axios\.(put|post|delete)/);
  });

  it('carga el entorno, y los dos archivos que esta instalación usa', () => {
    /*
     * La primera corrida en la máquina de SUMA dijo «falta configuración»
     * teniendo las tres variables puestas: un guion suelto lee `process.env` y
     * nadie se lo había llenado. Y un `cargarEnv()` a secas tampoco bastaba,
     * porque esta instalación tiene `.env.local` y no `.env`.
     */
    expect(GUION).toMatch(/cargarEnv\(\{ path: '\.env\.local' \}\)/);
    expect(GUION).toMatch(/^cargarEnv\(\);$/m);
  });

  describe('no saber no es que no', () => {
    /*
     * Encontrado al correrlo contra el realm de SUMA, el 10 de octubre.
     *
     * Keycloak contesta a `GET /admin/realms/<realm>` aunque la cuenta no tenga
     * `view-realm`: devuelve una representación RECORTADA, con el nombre y poco
     * más. El guion no lo distinguía y, al faltar `internationalizationEnabled`,
     * imprimió «desactivados — la pantalla de acceso sale en inglés». Puede que
     * lo esté y puede que no: no lo sabía, y lo afirmó.
     *
     * Es el defecto de siempre con otra cara —un dato ausente leído como una
     * respuesta— y aquí manda a cambiar una configuración que quizá ya está
     * bien.
     */
    it('reconoce la respuesta recortada y no afirma nada sobre ella', () => {
      expect(GUION).toMatch(/const recortada =/);
      expect(GUION).toMatch(/NO se afirma nada sobre cómo está: no se sabe/);
      expect(GUION).toMatch(/view-realm/);
    });

    it('«desactivado» sólo se dice cuando el realm dijo que lo está', () => {
      /*
       * `=== false`, no `!valor`. Con la negación, `undefined` —que es «no
       * vino»— se leía como «apagado».
       */
      expect(GUION).toMatch(/internationalizationEnabled === true/);
      expect(GUION).toMatch(/internationalizationEnabled === false/);
      expect(GUION).not.toMatch(/if \(!ajustes\.internationalizationEnabled\)/);
      expect(GUION).toMatch(/\(no vino en la respuesta\)/);
    });

    it('un 403 al listar dice qué rol falta y dónde se pone', () => {
      /*
       * El caso real: la cuenta tiene `manage-users` y `view-users` —lo que el
       * ERP necesita para dar de alta— y nada sobre el realm. Decir «403» a
       * secas manda a adivinar.
       */
      expect(GUION).toMatch(/status === 403/);
      expect(GUION).toMatch(/Service account roles/);
      expect(GUION).toMatch(/Los roles que harían falta/);
      /* Y ofrece la salida de hacerlo a mano, para no obligar a dar el permiso. */
      expect(GUION).toMatch(/Realm roles → Create role/);
    });
  });

  it('el prefijo separa los dos sistemas que comparten realm', () => {
    expect(GUION).toMatch(/export const PREFIJO_ROL_ERP = 'erp:'/);
  });

  it('el ERP sigue sin leer roles del token', () => {
    /*
     * El trinquete de la decisión. Si alguien aplicara el paso 2 sin querer
     * —o sin decirlo— esto se pone rojo: declarar roles en el realm no puede
     * convertirse, de callada, en empezar a obedecerlos.
     */
    const estrategia = readFileSync(
      join(__dirname, 'strategies', 'jwt.strategy.ts'),
      'utf8',
    );
    expect(estrategia).not.toMatch(/realm_access/);
    expect(estrategia).not.toMatch(/resolverRol/);
    const retorno = estrategia.slice(estrategia.lastIndexOf('keycloakSub: payload.sub'));
    expect(retorno).toMatch(/rol:\s*usuario\.rol/);
  });
});
