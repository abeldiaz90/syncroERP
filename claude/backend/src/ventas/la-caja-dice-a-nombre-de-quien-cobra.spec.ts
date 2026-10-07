import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * La caja dice a nombre de quien cobra
 * ----------------------------------------------------------------------------
 * MEDIDO EL 7-OCT-2026, por pantalla, cobrando de verdad.
 *
 * Con la suplantacion puesta —Administracion → Ver como → Empleado Prueba—
 * se cobro un cafe de $320 en el punto de venta. La barra de la caja decia
 * «Abel Diaz · Atiende» de principio a fin. La venta quedo asi:
 *
 *     folio 10 · $320 · usuarioId d9e3ffeb… = Empleado Prueba
 *
 * `lib/api` manda la cabecera de suplantacion en TODA llamada, asi que el
 * servidor atiende como el suplantado. La barra leia el JWT, que es de quien
 * inicio sesion. Dos fuentes para una sola pregunta —¿quien atiende?— y la
 * pantalla contestaba una cosa mientras el registro guardaba otra.
 *
 * Y no habia donde darse cuenta: la banda ambar de suplantacion vive en el
 * layout del area de trabajo, y la caja tiene layout propio. La unica pantalla
 * donde el error mueve dinero era la unica sin el aviso.
 *
 * El mismo desajuste apagaba el aviso de «turno abierto por otra persona», que
 * existe desde el dia anterior justo para que nadie cobre en el cajon de otro:
 * comparaba el turno contra el id del JWT y no contra quien atiende, asi que
 * con la suplantacion puesta salia en gris —medido— en vez de en ambar. Un
 * aviso que se apaga en su propio caso es peor que no tenerlo.
 *
 * QUE CUIDA ESTA PRUEBA
 *
 * Que exista una sola respuesta a «quien atiende» —`quienAtiende`—, que las
 * dos piezas de la caja la usen, que la barra lo diga cuando es otro, y que el
 * aviso del turno se compare contra quien cobra.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const leer = (relativa: string): string => {
  if (!FRONTEND) return '';
  const ruta = join(FRONTEND, relativa);
  return existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';
};

describe('Punto de venta · la caja dice a nombre de quien cobra', () => {
  if (!FRONTEND) {
    it('sin frontend en el arbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const verComo = leer('lib/ver-como.ts');
  const barra = leer('app/pos/page.tsx');
  const terminal = leer('app/pos/terminal.tsx');

  it('hay una sola respuesta a quien atiende, y vive con la suplantacion', () => {
    /*
     * En el mismo modulo que guarda a quien se esta viendo y que define la
     * cabecera. Separarlos es volver a tener dos fuentes.
     */
    expect(verComo).toMatch(/export function quienAtiende\(/);
    expect(verComo).toMatch(/suplantado: boolean/);
    /* Devuelve el suplantado cuando lo hay; si no, la sesion. */
    expect(verComo).toMatch(/if \(visto\) return \{[^}]*suplantado: true/);
  });

  it('la barra de la caja nombra a quien atiende, no al de la sesion', () => {
    expect(barra).toMatch(/quienAtiende/);
    /*
     * El caso concreto. Pintar el nombre del JWT junto a «Atiende» es
     * exactamente lo que grabo la venta a nombre de otro.
     */
    expect(barra).not.toMatch(
      /\{sesion\?\.nombreCompleto \?\? sesion\?\.email \?\? '—'\}/,
    );
  });

  it('la barra dice que estas viendo como otro, y deja volver', () => {
    /*
     * Decirlo no basta si no se puede deshacer sin salir de la caja: quien se
     * da cuenta a mitad de una venta necesita la salida ahi mismo.
     */
    expect(barra).toMatch(/atiende\.suplantado/);
    expect(barra).toMatch(/establecerVerComo\(null\)/);
    expect(barra).toMatch(/amber/);
  });

  it('el aviso del turno se compara contra quien cobra', () => {
    expect(terminal).toMatch(/quienAtiende\(leerSesion\(sesionToken\.get\(\)\)\)\.id/);
    /* La forma vieja, que miraba el JWT a secas, no vuelve. */
    expect(terminal).not.toMatch(
      /setYoId\(leerSesion\(sesionToken\.get\(\)\)\?\.id \?\? ''\)/,
    );
    /* Y sigue habiendo aviso que encender. */
    expect(terminal).toMatch(/turnoDeOtro/);
  });

  it('las dos piezas se rehacen al cambiar de persona', () => {
    /*
     * Sin esto, cambiar de suplantacion deja el nombre anterior en pantalla
     * mientras las llamadas ya van con el nuevo: el mismo defecto, un paso
     * mas tarde.
     */
    for (const pieza of [barra, terminal]) {
      expect(pieza).toMatch(/addEventListener\(EVENTO_VER_COMO/);
      expect(pieza).toMatch(/removeEventListener\(EVENTO_VER_COMO/);
    }
  });
});
