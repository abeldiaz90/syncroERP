/**
 * ============================================================================
 * Un modal se cierra con Escape
 * ----------------------------------------------------------------------------
 * MEDIDO el 7-oct-2026 sobre el árbol vivo, el mismo día en que se encontró un
 * modal cuyo botón quedaba FUERA de la pantalla en un portátil:
 *
 *   · 50 modales en el ERP.
 *   · **44 no respondían a Escape.**
 *   · **32 no se cerraban pulsando fuera.**
 *
 * La única salida era encontrar el botón «Cancelar» o la equis. Eso no es una
 * comodidad: Escape es la tecla que todo el mundo pulsa sin pensar cuando algo
 * tapa la pantalla, y es la salida de emergencia cuando el modal no cabe —que
 * ese día pasó de verdad, y sin Escape fue un callejón sin salida en vez de una
 * molestia—.
 *
 * ESTO ES UN TRINQUETE, NO UNA LÍNEA DE META
 *
 * Arreglarlos todos de golpe son treinta y seis cirugías distintas en una
 * entrega a días de producción, y cada modal cierra de una manera: algunos
 * pierden un formulario largo a medio llenar y ahí Escape tendría que preguntar
 * antes. Así que se hace lo que se puede hacer bien: el gancho compartido, los
 * que son de una línea, y **un número que sólo puede bajar**.
 *
 * Si alguien añade un modal sin salida, esto se pone rojo. Si alguien arregla
 * uno, baja el número de aquí y queda fijado para siempre.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

/**
 * CUÁNTOS QUEDAN SIN ESCAPE. Este número sólo puede bajar.
 *
 * 36 cuando se midió. 24 al cerrar la noche:
 *
 *   · el diálogo de confirmación, que lo abre media aplicación;
 *   · las altas de cuenta de caja y de proveedor;
 *   · y los nueve catálogos cortos —bancos, estados, formas de pago, países,
 *     impuestos, departamentos, marcas, unidades de medida y almacenes—, que
 *     son formularios de tres campos donde cerrar sin querer no cuesta nada.
 *
 * Las altas LARGAS se quedaron fuera a propósito —cliente, producto de crédito,
 * requisición, cuenta contable—: ahí Escape tendría que preguntar antes de
 * tirar un formulario a medio llenar, y eso es una decisión por pantalla, no un
 * reemplazo masivo.
 */
const DEUDA_MAXIMA = 24;

function pantallas(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) pantallas(ruta, acc);
    else if (nombre.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
}

/** Los archivos que pintan al menos un modal que tapa la pantalla. */
function conModal(archivos: string[]): string[] {
  return archivos.filter((ruta) => {
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/className=(?:"|\{`)([^"`]*fixed inset-0[^"`]*)(?:"|`\})/g)) {
      if (!/\bflex\b|\bgrid\b/.test(m[1])) continue;
      if (/items-|place-items|justify-center/.test(m[1])) return true;
    }
    return false;
  });
}

const tieneSalida = (texto: string) =>
  /useCerrarConEscape|['"]Escape['"]|keydown/.test(texto);

describe('El gancho que cierra un modal con Escape', () => {
  const hay = Boolean(FRONTEND);

  it('el árbol que se mide es el que está vivo', () => {
    expect(hay).toBe(true);
  });

  const gancho = hay
    ? readFileSync(join(FRONTEND!, 'hooks/use-cerrar-con-escape.ts'), 'utf8')
    : '';

  it('sólo escucha el modal que está abierto', () => {
    /*
     * Sin esto, un modal cerrado se traga la tecla de otro que sí lo está, y
     * dos modales anidados se cierran los dos de golpe.
     */
    expect(gancho).toMatch(/if \(!abierto\) return;/);
  });

  it('no roba un Escape que ya consumió otro control', () => {
    /*
     * Un desplegable abierto o un campo con autocompletado consumen Escape y
     * lo marcan. Cerrar además el modal entero se siente como si la tecla
     * hiciera dos cosas a la vez.
     */
    expect(gancho).toMatch(/if \(e\.defaultPrevented\) return;/);
  });

  it('y quita el oyente al cerrarse', () => {
    // Un oyente por cada vez que se abra el modal es una fuga y un cierre doble.
    expect(gancho).toMatch(/removeEventListener\('keydown', alPulsar\)/);
  });
});

describe('Y los modales que ya lo usan, con la deuda medida', () => {
  const archivos = FRONTEND ? pantallas(join(FRONTEND, 'app')) : [];
  const modales = conModal(archivos);

  it('el barrido encuentra de verdad los modales', () => {
    // Si las clases cambian de forma, esto se queda en cero y no mide nada.
    expect(modales.length).toBeGreaterThanOrEqual(30);
  });

  it('el diálogo de confirmación lo usa: lo abre media aplicación', () => {
    const confirmar = readFileSync(
      join(FRONTEND!, 'app/components/ConfirmDialog.tsx'),
      'utf8',
    );
    expect(confirmar).toContain('useCerrarConEscape(abierto && !procesando, onCancelar)');
    /*
     * Y con `!procesando`: cerrar mientras se confirma dejaría la operación en
     * curso sin nada en pantalla que la explique.
     */
  });

  it('la deuda no crece: ningún modal nuevo nace sin salida', () => {
    const sinSalida = modales
      .filter((ruta) => !tieneSalida(readFileSync(ruta, 'utf8')))
      .map((ruta) => relative(FRONTEND!, ruta).split(sep).join('/'));
    /*
     * Si esto se pone rojo por haber SUBIDO, el modal nuevo necesita su
     * `useCerrarConEscape`. Si se pone rojo por haber BAJADO, enhorabuena:
     * baja `DEUDA_MAXIMA` y queda fijado.
     */
    expect(sinSalida.length).toBeLessThanOrEqual(DEUDA_MAXIMA);
  });
});
