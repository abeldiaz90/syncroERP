/**
 * ============================================================================
 * Contar el cajón, no teclear un total
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 *
 * El arqueo pedía un número: «Efectivo contado». Quien cuenta el cajón hacía la
 * suma de cabeza o en el teléfono y tecleaba el resultado. Cualquier error de
 * esa suma se convierte en un faltante o un sobrante **contabilizado a su
 * nombre**, en una póliza que no se deshace, y a partir de ahí nadie puede
 * reconstruir si faltaba dinero o faltaba un cero.
 *
 * Se vio de cerca el 7-oct-2026 cerrando un turno de prueba: el sistema levanta
 * la póliza del faltante sin preguntar dos veces, y el único control contra un
 * dedo de más en el teclado era la atención de la persona a la una de la
 * mañana.
 *
 * LO QUE SE AÑADE
 *
 * Contar por montones —billetes y monedas de México— y que el sistema sume. Es
 * como se cuenta un cajón de verdad.
 *
 * Y LO QUE NO SE HACE, QUE IMPORTA IGUAL
 *
 * No se dejan DOS campos. Mientras el conteo por montones está abierto, el
 * total es el resultado y no se puede teclear; cerrarlo devuelve el campo a
 * mano, en blanco. Dos cifras que pueden decir cosas distintas en la misma
 * pantalla son peor que una sola mal tecleada: la segunda se descubre, la
 * primera se discute.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));
const ruta = FRONTEND ? join(FRONTEND, 'app/dashboard/tesoreria/caja/page.tsx') : '';
const hay = Boolean(ruta && existsSync(ruta));
const caja = hay ? readFileSync(ruta, 'utf8') : '';

describe('El cajón se cuenta por montones', () => {
  it('la pantalla que se mide es la que está viva', () => {
    expect(hay).toBe(true);
  });

  it('están las denominaciones de México, billetes y monedas', () => {
    for (const etiqueta of ['$1,000', '$500', '$200', '$100', '$50', '$20', '$10', '$5', '$2', '$1', '50¢']) {
      expect(caja).toContain(`etiqueta: '${etiqueta}'`);
    }
  });

  it('y el billete de $20 no se confunde con la moneda de $20', () => {
    /*
     * Las dos valen lo mismo y conviven en el cajón. Si la llave fuera sólo el
     * valor, teclear los billetes borraría las monedas —y al revés— sin que
     * nada lo dijera: el total saldría bien unas veces y mal otras.
     */
    expect(caja).toMatch(/const llaveDe = \(d: \(typeof DENOMINACIONES\)\[number\]\) => `\$\{d\.clase\}-\$\{d\.valor\}`/);
    expect((caja.match(/etiqueta: '\$20'/g) ?? []).length).toBe(2);
  });

  it('la suma se redondea a centavos', () => {
    /*
     * Seis monedas de 50¢ en coma flotante dejan una cola de céntimos, y esa
     * cola sale luego como una diferencia de arqueo de $0.0000001 que nadie
     * puede explicar ni cuadrar.
     */
    expect(caja).toMatch(/Math\.round\(suma \* 100\) \/ 100/);
  });

  it('cada montón enseña su parcial', () => {
    // Un montón mal tecleado se ve antes de cerrar, no después en la póliza.
    expect(caja).toMatch(/parcial > 0 \? moneda\.format\(parcial\) : '—'/);
  });
});

describe('Y nunca hay dos cifras compitiendo por ser la buena', () => {
  it('con los montones abiertos, el total no se teclea: es el resultado', () => {
    expect(caja).toMatch(/\? String\(totalMontones \?\? 0\)/);
    // El campo manual sólo existe en la otra rama.
    expect(caja).toMatch(/\{montones === null \? \(/);
  });

  it('y abrir el panel no es haber contado: sin montón tecleado no hay cifra', () => {
    /*
     * Con cero, abrir el panel para empezar a contar enseñaba al instante
     * «FALTAN $150.00» —el efectivo esperado entero— antes de haber contado un
     * solo billete. Un cero que nadie contó no es un conteo de cero, y un aviso
     * que grita desde el primer segundo se aprende a ignorar.
     */
    expect(caja).toMatch(/const hayAlgunMonton = Boolean\(/);
    expect(caja).toMatch(/\? hayAlgunMonton\s*\n\s*\? String\(totalMontones \?\? 0\)\s*\n\s*: ''/);
  });

  it('el cierre manda lo que se ve en pantalla, no la otra variable', () => {
    /*
     * Si aquí volviera `Number(conteo)`, el arqueo por montones enviaría cadena
     * vacía y cerraría con cero: todo el efectivo esperado como faltante.
     */
    expect(caja).toMatch(/efectivoContado: Number\(contadoEfectivo\)/);
    expect(caja).not.toMatch(/efectivoContado: Number\(conteo\)/);
  });

  it('y el mensaje del cierre mide contra la misma cifra', () => {
    expect(caja).toMatch(/const contado = Number\(contadoEfectivo\);/);
  });

  it('volver a teclear el total deja el campo en blanco, no con el conteo viejo', () => {
    expect(caja).toMatch(/setMontones\(null\); setConteo\(''\);/);
  });

  it('y al cerrar el turno se limpian las dos cosas', () => {
    const cola = caja.slice(caja.indexOf('if (ok) {', caja.indexOf('async function cerrar')));
    expect(cola.slice(0, 200)).toContain('setMontones(null);');
  });
});

describe('No se cierra un turno sin haber contado nada', () => {
  it('y no se finge un control que el navegador no aplica', () => {
    /*
     * El campo oculto que lleva el total es `readOnly`, y un `readOnly` NO lo
     * valida el navegador: ponerle `required` habría sido un control que se
     * cree puesto. El que de verdad impide cerrar está abajo, en el envío.
     */
    const oculto = caja.slice(caja.indexOf('aria-label="Efectivo contado"\n                      type="number"'));
    expect(oculto.slice(0, 260)).toContain('readOnly');
    expect(oculto.slice(0, 260)).not.toContain('required');
  });

  it('el formulario no pasa con los montones vacíos', () => {
    /*
     * Un campo `readOnly` NO lo valida el navegador, así que `required` ahí no
     * protege nada. Y cerrar con cero contabiliza todo el efectivo esperado
     * como faltante, a nombre de quien cerró, sin vuelta atrás.
     */
    expect(caja).toMatch(/if \(montones && !hayAlgunMonton\) \{/);
    expect(caja).toContain('Todavía no has contado ningún montón');
  });

  it('pero un cajón vacío de verdad sí se puede cerrar', () => {
    // Escribir un 0 es un acto deliberado; no tocar nada, un descuido.
    expect(caja).toContain('escribe 0 en alguna denominación');
  });
});
