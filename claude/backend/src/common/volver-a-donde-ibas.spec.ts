import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * LA SESIÓN VENCIÓ, Y EL ERP TE DEJABA EN LA PUERTA SIN RECORDAR A DÓNDE IBAS
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 6-oct, probando por pantalla. Abrí `/dashboard/creditos/creditos` con el token
 * ya caducado y el ERP me mandó a `/login` **pelado**, sin `next`. Después de
 * entrar, uno aparece en la raíz, no donde iba.
 *
 * LO RARO ES QUE ESTABA RESUELTO
 *
 * `lib/api.ts` tiene `destinoDeRegreso()`, con su comentario explicando los dos
 * casos difíciles: conserva la query, descarta un `next` heredado para que no
 * se encadenen hasta reventar la URL, y no se dispara desde la propia pantalla
 * de acceso —si no, entrar te devolvía al formulario de entrada y parecía que
 * la contraseña había fallado—. Está bien pensado y bien escrito.
 *
 * Y casi nunca corría. Los DOS guardias que de verdad echan a alguien son los
 * `layout.tsx` del tablero y del punto de venta: comprueban la vigencia del
 * token en CADA cambio de ruta, así que con la sesión vencida saltan ellos
 * primero, antes de que ninguna petición devuelva 401. Los dos hacían
 * `router.replace('/login')` a secas.
 *
 * O sea: el cuidado existía, estaba escrito, y el camino por el que pasa la
 * gente no lo usaba. Es la misma forma que «Ver como» —una capacidad bien hecha
 * que el único camino real no ejerce— y que el panel de la consola, el mismo
 * día.
 *
 * En el punto de venta duele más: quien está cobrando vuelve al principio en
 * vez de a la caja donde tenía la venta a medias.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 * Que ningún guardia de sesión mande a `/login` a secas. No fija el texto de la
 * URL: fija que los dos pasen por la misma función que ya sabía hacerlo.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['frontend', '../frontend', 'claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'lib/api.ts')));

const leer = (relativa: string) => readFileSync(join(FRONTEND!, relativa), 'utf8');

/** Sin comentarios: aquí se mide código, no explicaciones. */
const sinComentarios = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Los guardias que echan a alguien al navegar, no al recibir un 401. */
const GUARDIAS = ['app/dashboard/layout.tsx', 'app/pos/layout.tsx'];

describe('quien te echa, recuerda a dónde ibas', () => {
  it('encuentra el árbol de frontend, o truena', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('la función que lo sabe hacer está exportada', () => {
    const api = sinComentarios(leer('lib/api.ts'));
    expect(api).toMatch(/export function rutaDeAccesoConRegreso\(\): string/);
    /* Y sigue apoyándose en el cálculo cuidadoso de siempre, no en uno nuevo. */
    expect(api).toMatch(/const destino = destinoDeRegreso\(\);/);
    expect(api).toMatch(/\/login\?next=\$\{encodeURIComponent\(destino\)\}/);
  });

  it('el 401 también pasa por ella, y no se duplica el cálculo', () => {
    const api = sinComentarios(leer('lib/api.ts'));
    expect(api).toMatch(/window\.location\.href = rutaDeAccesoConRegreso\(\);/);
    /* Una sola construcción de la URL en todo el archivo. */
    expect((api.match(/\/login\?next=/g) ?? []).length).toBe(1);
  });

  for (const guardia of GUARDIAS) {
    it(`${guardia} no manda a /login a secas`, () => {
      const s = sinComentarios(leer(guardia));
      /* LO QUE FALLABA. En negativo, para que no vuelva. */
      expect(s).not.toMatch(/router\.replace\('\/login'\)/);
      expect(s).toMatch(/router\.replace\(rutaDeAccesoConRegreso\(\)\)/);
      expect(s).toMatch(/rutaDeAccesoConRegreso.*from '@\/lib\/api'/);
    });
  }

  it('las pantallas que SÍ deben ir al acceso pelado se quedan como están', () => {
    /*
     * No todo enlace a `/login` es un defecto. Aceptar una invitación y el
     * retorno de la identidad terminan ahí a propósito: no hay ningún sitio al
     * que volver. Si esta prueba empezara a exigirles un `next`, estaría
     * arreglando algo que no está roto.
     */
    expect(sinComentarios(leer('app/aceptar-invitacion/page.tsx'))).toMatch(
      /router\.push\('\/login'\)/,
    );
  });
});
