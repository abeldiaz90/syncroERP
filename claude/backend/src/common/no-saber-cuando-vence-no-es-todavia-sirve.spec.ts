import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * No saber cuando vence no es «todavia sirve»
 * ----------------------------------------------------------------------------
 * MEDIDO EL 7-OCT-2026, dos veces en una manana.
 *
 * La sesion del ERP se cayo sola a mitad de un recorrido —la segunda vez, a
 * los pocos minutos de entrar— y el almacen del navegador decia por que:
 *
 *     syncro_token    presente
 *     syncro_refresh  presente
 *     syncro_expira   null
 *
 * Habia con que renovar. Nadie lo intento ni una sola vez.
 *
 * `lib/sesion.ts` tiene tres caminos a la renovacion y los tres pasaban por la
 * misma pregunta: cuando vence. Sin fecha, `porVencer()` contestaba `false`
 * —«no esta por vencer»— y `programarRenovacion()` se iba sin programar nada.
 * Las dos puertas cerradas por el mismo dato ausente, y el sintoma —volver a
 * /login— no senala a la causa.
 *
 * El propio archivo ya tenia escrito el criterio correcto dos funciones mas
 * arriba, para cuando Keycloak no manda `expires_in`:
 *
 *     «se asume corto y se renueva pronto: equivocarse por abajo cuesta una
 *      renovacion de mas; por arriba, la sesion»
 *
 * Es la familia de `un-cero-mientras-se-consulta-no-es-un-cero` aplicada al
 * tiempo: un dato que falta contestado con la respuesta tranquilizadora.
 *
 * QUE CUIDA ESTA PRUEBA
 *
 * Que sin fecha de vencimiento, pero con token de renovacion, las dos puertas
 * sigan abiertas. Y que el freno este puesto: sin fecha `porVencer` contesta
 * que si en CADA peticion, asi que una renovacion que falla no puede
 * convertirse en una peticion por pantalla contra el mismo muro.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/** Sin comentarios: aqui se mide codigo, no explicaciones. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Sesion · no saber cuando vence no es «todavia sirve»', () => {
  if (!FRONTEND) {
    it('sin frontend en el arbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const fuente = sinComentarios(
    readFileSync(join(FRONTEND, 'lib/sesion.ts'), 'utf8'),
  );

  it('el archivo es el que creo que es', () => {
    expect(fuente).toMatch(/export function porVencer\(\)/);
    expect(fuente).toMatch(/export function programarRenovacion\(\)/);
    expect(fuente).toMatch(/const CLAVE_EXPIRA = 'syncro_expira'/);
  });

  it('sin fecha, porVencer mira si hay con que renovar', () => {
    /* La forma vieja, que daba por buena una fecha que no existe. */
    expect(fuente).not.toMatch(/const vence = venceEn\(\);\s*if \(!vence\) return false;/);
    expect(fuente).toMatch(
      /const vence = venceEn\(\);\s*if \(!vence\) return Boolean\(leer\(CLAVE_REFRESH\)\);/,
    );
  });

  it('sin fecha, el temporizador tambien se programa', () => {
    /*
     * La otra puerta. Mirar `vence` antes de decidir si se programa era lo que
     * dejaba la sesion sin un solo intento.
     */
    expect(fuente).not.toMatch(/if \(!vence \|\| !leer\(CLAVE_REFRESH\)\) return;/);
    expect(fuente).toMatch(/if \(!leer\(CLAVE_REFRESH\)\) return;/);
    expect(fuente).toMatch(/const espera = vence\s*\?[\s\S]{0,120}: 5_000;/);
  });

  it('una renovacion que falla no se reintenta en cada peticion', () => {
    /*
     * El precio de abrir las dos puertas: sin fecha, `porVencer` contesta que
     * si siempre. El candado `enVuelo` junta las simultaneas y no las
     * seguidas, asi que hace falta una espera tras el fallo.
     */
    expect(fuente).toMatch(/let ultimoFallo = 0;/);
    expect(fuente).toMatch(/const ESPERA_TRAS_FALLO_MS = \d[\d_]*;/);
    expect(fuente).toMatch(
      /if \(Date\.now\(\) - ultimoFallo < ESPERA_TRAS_FALLO_MS\) \{/,
    );
    /* Y una que funciona lo borra, o el freno se quedaria puesto. */
    expect(fuente).toMatch(/ultimoFallo = 0;\s*guardarSesion\(tokens\);/);
  });

  it('el candado tambien cubre a las otras pestanas', () => {
    /*
     * ── EL CANDADO ERA POR PESTANA ──────────────────────────────────
     * El encabezado del archivo nombra el riesgo —«con rotacion de refresh
     * tokens, dos renovaciones en paralelo se anulan entre si»— y pone un
     * candado. Pero `enVuelo` es una variable de modulo: junta las veinte
     * peticiones de UNA pestana y no sabe nada de las demas.
     *
     * Con el ERP en tres pestanas —el area de trabajo, la caja y un reporte—
     * hay tres temporizadores apuntando al mismo minuto. La primera rota el
     * token y las otras dos llegan con uno gastado. El candado que el archivo
     * creia tener no cubria el caso para el que se escribio.
     */
    expect(fuente).toMatch(/const CLAVE_RENOVANDO = 'syncro_renovando';/);
    expect(fuente).toMatch(/function otraPestanaRenueva\(\): boolean/);
    /* Se consulta ANTES de pedir, y entonces se espera en vez de competir. */
    expect(fuente).toMatch(
      /if \(otraPestanaRenueva\(\)\) \{[\s\S]{0,200}esperarRenovacionAjena\(refresh\)/,
    );
    expect(fuente).toMatch(/marcarRenovando\(\);/);
    /* Y la marca se suelta pase lo que pase, o bloquearia diez segundos. */
    expect(fuente).toMatch(/finally \{\s*soltarMarca\(\);/);
    /* Cerrar sesion tambien la limpia. */
    expect(fuente).toMatch(/CLAVE_EXPIRA,\s*CLAVE_RENOVANDO,/);
  });

  it('una marca abandonada no bloquea para siempre', () => {
    /*
     * Una pestana que se cierra a mitad deja su marca puesta. Si se respetara
     * sin caducidad, nadie volveria a renovar nunca: el arreglo se habria
     * convertido en el mismo defecto por el otro lado.
     */
    expect(fuente).toMatch(/const VENTANA_RENOVACION_MS = \d[\d_]*;/);
    expect(fuente).toMatch(/edad >= 0 && edad < VENTANA_RENOVACION_MS/);
  });

  it('la espera mira el token, no el reloj', () => {
    /*
     * Con rotacion, lo que cambia al renovar es el refresh token. Esperar a
     * que cambie la FECHA daria por buena una renovacion que no ocurrio en
     * un realm que no rota la fecha a tiempo.
     */
    expect(fuente).toMatch(
      /async function esperarRenovacionAjena\(refreshViejo: string\)/,
    );
    expect(fuente).toMatch(/leer\(CLAVE_REFRESH\) !== refreshViejo/);
  });

  it('los tres caminos a la renovacion siguen existiendo', () => {
    /*
     * La prueba de la prueba: si alguien quita una de las tres piezas que el
     * encabezado del archivo promete, lo de arriba seguiria en verde midiendo
     * un mecanismo que ya no se usa.
     */
    expect(fuente).toMatch(/export async function asegurarSesion\(\)/);
    expect(fuente).toMatch(/temporizador = setTimeout\(/);
    expect(fuente).toMatch(/addEventListener\('visibilitychange'/);
  });
});
