/**
 * ============================================================================
 * Dos botones de la caja que pedían lo que esta sesión no puede dar
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PRUEBA
 *
 * MEDIDO el 15-oct-2026 abriendo «Caja, corte y arqueo» como Empleado /
 * Vendedor —el rol del mostrador, el que usa esta pantalla todo el día—: el
 * catálogo de cuentas contables no está en su perfil, y la pantalla ya lo
 * decía con todas sus letras:
 *
 *   «El catálogo de cuentas contables no está en tu perfil, así que no hay
 *    contra qué registrar el movimiento. Lo lleva Contabilidad.»
 *
 * Y justo debajo de ese aviso ofrecía «Entrada» y «Retiro» encendidos. El
 * selector de contrapartida es `required` y estaba vacío: «Entrada» envía el
 * formulario y el navegador se planta en el selector; «Retiro» es
 * `type="button"`, se salta la validación entera y llega a `registrarManual`,
 * que contesta «Elige la cuenta contra la que se registra el movimiento»
 * sobre un selector sin una sola opción que elegir.
 *
 * Es el patrón de siempre con otro disfraz: un control que no se puede
 * satisfacer y un botón que lleva a un no. La pantalla SABE que no hay
 * contrapartida —lo acaba de escribir en pantalla— y aun así deja pulsar.
 *
 * Esta prueba fija las dos mitades:
 *   · la condición se calcula una sola vez y se llama por su nombre;
 *   · los dos botones la miran, no sólo `procesando`.
 *
 * Y la prueba de la prueba: que no vuelva a aparecer un `disabled={procesando}`
 * suelto en esos dos botones, que es exactamente la forma que tenía el fallo.
 * ============================================================================
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((n) => join(RAIZ, n))
  .find((r) => existsSync(join(r, 'app/dashboard/tesoreria/caja/page.tsx')));

const CAJA = FRONTEND
  ? readFileSync(join(FRONTEND, 'app/dashboard/tesoreria/caja/page.tsx'), 'utf8')
  : '';

describe('la caja no ofrece un movimiento que no puede registrar', () => {
  it('encuentra la pantalla, o no mide nada', () => {
    expect(FRONTEND).toBeDefined();
    expect(CAJA.length).toBeGreaterThan(1000);
  });

  it('la condición se calcula una vez y tiene nombre', () => {
    expect(CAJA).toMatch(
      /const sinContrapartida =\s*contablesVedadas \|\| cuentasContables\.length === 0;/,
    );
  });

  it('los dos botones del movimiento manual la miran', () => {
    const entrada = /disabled=\{procesando \|\| sinContrapartida\}[^>]*>\s*<ArrowDownCircle/;
    const retiro = /disabled=\{procesando \|\| sinContrapartida\} type="button" onClick=\{\(\) => void registrarManual\('retiro'\)\}/;
    expect(CAJA).toMatch(entrada);
    expect(CAJA).toMatch(retiro);
  });

  it('el aviso que explica el motivo sigue encima de los botones', () => {
    expect(CAJA).toMatch(/\{sinContrapartida && \(/);
    expect(CAJA).toContain('Lo lleva Contabilidad.');
  });

  it('si aun así se llega a registrar, el mensaje dice la verdad', () => {
    /*
     * «Elige la cuenta» es una instrucción imposible cuando no hay ninguna.
     * El mensaje tiene que distinguir los dos casos: no haber elegido y no
     * tener de dónde.
     */
    expect(CAJA).toMatch(
      /texto: sinContrapartida\s*\?\s*'Esta sesión no tiene ninguna cuenta contable/,
    );
  });

  it('LA PRUEBA DE LA PRUEBA: en el formulario manual no queda ningún disabled={procesando} suelto', () => {
    /*
     * Ésa era la forma exacta del fallo. Si alguien añade un tercer botón al
     * formulario y lo apaga sólo mientras se envía, esta prueba lo dice.
     */
    const formulario =
      CAJA.split('Entrada o retiro manual')[1]?.split('Corte y arqueo')[0] ?? '';
    expect(formulario.length).toBeGreaterThan(200);
    expect(formulario).not.toMatch(/disabled=\{procesando\}/);
  });
});
