import 'reflect-metadata';

import { validarEntorno } from './validar-entorno';
import { debeSincronizarEsquema } from './esquema-database';

/**
 * ============================================================================
 * No declarar el entorno no es declarar desarrollo
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * `DB_SYNC=true` deja que TypeORM materialice el esquema desde las entidades:
 * crea, cambia y **borra** columnas para que la base se parezca al código. En
 * desarrollo es comodísimo; sobre datos reales es irreversible y silencioso —
 * no avisa, no pregunta, y la columna que se lleva no vuelve.
 *
 * Está defendido, y bien: `debeSincronizarEsquema` exige que `NODE_ENV` no sea
 * `production`, y esa condición manda sobre `DB_SYNC` a propósito.
 *
 * Lo que no estaba defendido es el otro lado. `NODE_ENV` es opcional y por
 * omisión vale `development`; `DB_SYNC` vale `'true'` por omisión. **La
 * combinación peligrosa es la que sale de no configurar nada.** Un despliegue
 * que se olvide de poner `NODE_ENV` —que es justo lo que se olvida— arranca
 * contra la base del cliente creyéndose de desarrollo y la sincroniza.
 *
 * LA DEFENSA
 *
 * Si nadie declaró el entorno y la base NO es local, no se arranca. No se
 * cambia el valor por omisión en silencio: un dev que depende de él se
 * quedaría sin esquema sin saber por qué. Se dice cuál de las dos cosas hay
 * que escribir.
 *
 * Un servicio que no levanta se arregla en minutos; uno que levanta y reescribe
 * un esquema no se arregla.
 * ============================================================================
 */

/** Lo mínimo para que la validación llegue hasta donde importa. */
const BASE = {
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'n',
  JWT_SECRET: 'x'.repeat(40),
};

function entorno(extra: Record<string, unknown>) {
  return () => validarEntorno({ ...BASE, ...extra });
}

describe('no declarar el entorno no es declarar desarrollo', () => {
  describe('la regla de fondo, que no cambia', () => {
    it('en producción, DB_SYNC=true se ignora', () => {
      expect(debeSincronizarEsquema('production', 'true')).toBe(false);
    });
    it('en desarrollo, DB_SYNC=true sincroniza', () => {
      expect(debeSincronizarEsquema('development', 'true')).toBe(true);
    });
    it('sin entorno, la función sola se comporta como desarrollo', () => {
      /*
       * Esto es exactamente por lo que hace falta la defensa de arriba: la
       * función no puede distinguir «desarrollo» de «nadie lo dijo».
       */
      expect(debeSincronizarEsquema(undefined, 'true')).toBe(true);
    });
  });

  describe('la combinación que sale de no configurar nada', () => {
    it('se niega a arrancar contra una base remota', () => {
      expect(entorno({ DB_HOST: 'db.cliente.com' })).toThrow(
        /NODE_ENV no está declarado/,
      );
    });

    it('el mensaje nombra la base y dice las dos salidas', () => {
      let mensaje = '';
      try {
        entorno({ DB_HOST: '10.0.0.14' })();
      } catch (e) {
        mensaje = (e as Error).message;
      }
      expect(mensaje).toContain('10.0.0.14');
      expect(mensaje).toMatch(/NODE_ENV=production/);
      expect(mensaje).toMatch(/DB_SYNC=false/);
      /* Y dice qué se juega, no sólo que falta una variable. */
      expect(mensaje).toMatch(/borrar columnas/);
    });
  });

  describe('lo que sigue arrancando, para no estorbar a quien trabaja', () => {
    it('una base local sin NODE_ENV arranca igual que siempre', () => {
      expect(entorno({ DB_HOST: 'localhost' })).not.toThrow();
      expect(entorno({ DB_HOST: '127.0.0.1' })).not.toThrow();
      expect(entorno({ DB_HOST: 'host.docker.internal' })).not.toThrow();
    });

    it('una base remota con DB_SYNC=false arranca: ahí no hay nada que reescribir', () => {
      expect(
        entorno({ DB_HOST: 'db.cliente.com', DB_SYNC: 'false' }),
      ).not.toThrow();
    });

    it('declarar el entorno es suficiente, aunque sea desarrollo', () => {
      /*
       * Quien escribe `NODE_ENV=development` contra una base remota lo está
       * diciendo a propósito. La defensa es contra el olvido, no contra la
       * decisión.
       */
      expect(
        entorno({ DB_HOST: 'db.cliente.com', NODE_ENV: 'development' }),
      ).not.toThrow();
    });

    it('una variable declarada vacía cuenta como no declarada', () => {
      /*
       * `.env` con `NODE_ENV=` llega como cadena vacía y se descarta antes de
       * validar —por eso existe esa limpieza—. Si eso contara como declarado,
       * la defensa se saltaría con una línea en blanco.
       */
      expect(entorno({ DB_HOST: 'db.cliente.com', NODE_ENV: '' })).toThrow(
        /NODE_ENV no está declarado/,
      );
    });
  });

  describe('la prueba de la prueba', () => {
    it('sin la defensa, el caso peligroso pasaría', () => {
      /*
       * Se reconstruye a mano la condición que protege. Si alguien la relaja
       * —por ejemplo quitando el `!baseLocal`— esta comprobación deja de
       * describir lo que el código hace y el resto de la suite lo dice.
       */
      const peligroso = (declarado: boolean, host: string, sync: string) =>
        !declarado &&
        !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal|db|postgres)$/i.test(
          host,
        ) &&
        sync === 'true';

      expect(peligroso(false, 'db.cliente.com', 'true')).toBe(true);
      expect(peligroso(false, 'localhost', 'true')).toBe(false);
      expect(peligroso(true, 'db.cliente.com', 'true')).toBe(false);
      expect(peligroso(false, 'db.cliente.com', 'false')).toBe(false);
    });
  });
});
