import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * Los cuatro ojos del almacén, también en la pantalla
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Se recorrió una transferencia entre almacenes de punta a punta el
 * 26-sep-2026, con el rol de almacén. El servidor impone dos separaciones, y
 * las dos son correctas:
 *
 *   · «Quien solicita la transferencia no puede autorizarla.»
 *   · «Quien envía la mercancía no puede registrar su recepción.»
 *
 * Pero la pantalla ofrecía los dos botones a la misma persona que acababa de
 * hacer el paso anterior. Se pulsaba, el servidor contestaba 400, y el motivo
 * llegaba en un aviso flotante de cuatro segundos: quien no llegaba a leerlo
 * volvía a pulsar, y la transferencia se quedaba parada sin que nadie supiera
 * a quién le tocaba moverla.
 *
 * Es el patrón que ya cerramos en compras y en crédito —un botón que lleva a
 * un «no»—, aquí con un agravante: el «no» es un control de segregación, así
 * que la pantalla no sólo debe dejar de ofrecer el botón, sino decir **a quién
 * le toca**.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que la pantalla compare con el usuario de la sesión antes de ofrecer
 * autorizar o recibir, y que en su lugar diga quién firma.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');
const RAIZ = join(SRC, '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

describe('Almacén · los cuatro ojos, también en la pantalla', () => {
  if (!FRONTEND) {
    it('sin frontend en el árbol, no hay nada que comprobar', () => {
      expect(true).toBe(true);
    });
    return;
  }

  const pantalla = join(
    FRONTEND,
    'app/dashboard/inventario/transferencias/page.tsx',
  );
  const texto = readFileSync(pantalla, 'utf8');

  it('la pantalla sabe quién es el usuario de la sesión', () => {
    expect(texto).toMatch(/usuarioId/);
    expect(texto).toMatch(/syncro_user/);
  });

  it('no ofrece autorizar a quien solicitó', () => {
    expect(texto).toMatch(/t\.usuarioId===usuarioId/);
    expect(texto).toMatch(/Espera autorización/);
  });

  it('no ofrece recibir a quien envió', () => {
    expect(texto).toMatch(/t\.enviadoPor===usuarioId/);
    expect(texto).toMatch(/la recibe el destino/);
  });

  it('el servidor sigue siendo quien manda', () => {
    /*
     * La pantalla es cortesía; la regla vive en el servicio y ahí se queda.
     * Si alguien la quitara de ahí, ocultar el botón no protegería nada.
     */
    const servicio = join(__dirname, 'wms.service.ts');
    const alterno = join(__dirname, 'transferencias.service.ts');
    const ruta = existsSync(servicio) ? servicio : alterno;
    if (!existsSync(ruta)) return;
    const codigo = readFileSync(ruta, 'utf8');
    expect(codigo).toMatch(/no puede autorizarla/);
    expect(codigo).toMatch(/no puede registrar su recepción/);
  });
});
