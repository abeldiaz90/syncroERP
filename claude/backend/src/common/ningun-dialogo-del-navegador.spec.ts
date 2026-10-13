/**
 * ============================================================================
 * NINGUNA PANTALLA PREGUNTA CON UN DIALOGO DEL NAVEGADOR
 * ----------------------------------------------------------------------------
 * MEDIDO el 13-oct-2026 con un grep sobre el arbol vivo. El proyecto tiene
 * desde hace tiempo sus propios dialogos —`confirmarElegante`,
 * `solicitarTexto`, `mensajeElegante`, y los componentes `Confirmacion` y
 * `ConfirmacionConMotivo`— y cuarenta y tantas pantallas los usan. Cuatro no:
 *
 *   · cancelar una factura de proveedor  -> `window.prompt`
 *   · cancelar un pedido de venta        -> `window.prompt`
 *   · cobrar el precio de hoy            -> `window.confirm`
 *   · traspasar el resultado del ejercicio -> `window.confirm`
 *
 * La pieza buena existia y el camino real no la usaba, otra vez. Y no era
 * cuestion de estetica:
 *
 *  1. EL NAVEGADOR LOS PUEDE SUPRIMIR. Chrome ofrece "evitar que esta pagina
 *     cree mas dialogos" y, una vez marcado, `confirm` devuelve `false` y
 *     `prompt` devuelve `null` PARA SIEMPRE sin abrir nada. El codigo lee eso
 *     como "se arrepintio" y no hace nada: el boton deja de servir y la
 *     pantalla no lo dice. En una pestaña de fondo tampoco aparecen.
 *  2. LA NEGATIVA DEL SERVIDOR NO CABE. El dialogo ya se cerro cuando llega la
 *     respuesta, asi que un "no se puede cancelar: tiene un pago aplicado" se
 *     va a un aviso de esquina de 4.5 segundos con los ojos en otro lado, y lo
 *     tecleado se pierde.
 *  3. LA REGLA DEL MINIMO SE COMPROBABA DESPUES DE CERRAR. Quien escribia tres
 *     letras perdia lo escrito.
 *
 * ESTO ES UN TRINQUETE EN CERO
 *
 * A diferencia de los modales sin Escape, aqui no hay deuda que tolerar: los
 * cuatro se migraron, y el reemplazo existe para los dos casos —el que se
 * cierra al resolverse y el que se queda abierto cuando el servidor dice no—.
 * Si alguien vuelve a escribir uno, esto se pone rojo y le dice cual usar.
 *
 * LO QUE NO MIRA, Y POR QUE
 *
 * `window.alert` entra en la lista por la misma razon. `window.open` no: abrir
 * una pestaña con un PDF es otra cosa y es legitimo.
 * ============================================================================
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const CANDIDATAS = ['claude/frontend', 'frontend', '../claude/frontend'].map((n) =>
  join(RAIZ, n),
);
const FRONTEND = CANDIDATAS.find((ruta) =>
  existsSync(join(ruta, 'app/dashboard/module-config.ts')),
);

/** Los tres que bloquean la pagina y el navegador puede suprimir. */
const PROHIBIDOS = /(?:^|[^.\w])(?:window\s*\.\s*)?(prompt|confirm|alert)\s*\(/;

/** `confirm(` tambien aparece dentro de nombres propios del proyecto. */
const NOMBRES_PROPIOS = /confirmarElegante|Confirmacion|confirmarCon|setConfirmar/;

function pantallas(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) pantallas(ruta, acc);
    else if (nombre.endsWith('.tsx') || nombre.endsWith('.ts')) acc.push(ruta);
  }
  return acc;
}

/**
 * Una linea de comentario que NOMBRA el problema no es el problema. Esta
 * prueba existe porque los archivos migrados explican en su cabecera por que
 * `window.prompt` no servia, y esas lineas no deben ponerla roja.
 */
function esComentario(linea: string): boolean {
  const t = linea.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

describe('ninguna pantalla pregunta con un dialogo del navegador', () => {
  it('encuentra el frontend; si no, lo dice en vez de pasar en verde', () => {
    expect(FRONTEND).toBeDefined();
  });

  it('no queda ningun prompt, confirm ni alert del navegador', () => {
    const culpables: string[] = [];
    for (const ruta of pantallas(join(FRONTEND as string, 'app')).concat(
      pantallas(join(FRONTEND as string, 'components')),
    )) {
      const lineas = readFileSync(ruta, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (esComentario(linea)) return;
        const sinNombresPropios = linea.replace(new RegExp(NOMBRES_PROPIOS, 'g'), '');
        if (PROHIBIDOS.test(sinNombresPropios)) {
          culpables.push(`${relative(FRONTEND as string, ruta)}:${i + 1}  ${linea.trim()}`);
        }
      });
    }
    expect(culpables).toEqual([]);
  });

  it('el reemplazo que esta prueba exige existe de verdad', () => {
    // Una prueba que prohibe sin ofrecer alternativa la borra el siguiente.
    const dialogos = readFileSync(
      join(FRONTEND as string, 'components/ui/dialogos.tsx'),
      'utf8',
    );
    for (const pieza of ['confirmarElegante', 'solicitarTexto', 'mensajeElegante']) {
      expect(dialogos).toContain(`export async function ${pieza}`);
    }
    const ui = readFileSync(join(FRONTEND as string, 'components/ui/index.tsx'), 'utf8');
    expect(ui).toContain('export function Confirmacion(');
    expect(ui).toContain('export function ConfirmacionConMotivo(');
  });

  it('el minimo de caracteres se exige ANTES de cerrar, no despues', () => {
    const dialogos = readFileSync(
      join(FRONTEND as string, 'components/ui/dialogos.tsx'),
      'utf8',
    );
    // El boton apagado mientras falten caracteres, y el numero a la vista.
    expect(dialogos).toContain('faltan');
    expect(dialogos).toMatch(/disabled=\{[^}]*faltan > 0/);
    expect(dialogos).toContain('minimo');
  });

  it('la prueba sabe fallar', () => {
    // La prueba de la prueba: el patron tiene que atrapar las cuatro formas.
    for (const culpable of [
      "const m = window.prompt('motivo');",
      'if (window.confirm(mensaje)) return;',
      'window.alert("listo");',
      'if (confirm(mensaje)) return;',
    ]) {
      expect(PROHIBIDOS.test(culpable)).toBe(true);
    }
    // Y no debe atrapar lo que no es.
    for (const inocente of [
      'const ok = await confirmarElegante(mensaje);',
      '<Confirmacion abierto={!!cancelando}',
      'window.open(url, "_blank");',
      'setConfirmar(true);',
    ]) {
      const limpio = inocente.replace(new RegExp(NOMBRES_PROPIOS, 'g'), '');
      expect(PROHIBIDOS.test(limpio)).toBe(false);
    }
  });
});
