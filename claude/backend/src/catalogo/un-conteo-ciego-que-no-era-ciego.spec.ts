/**
 * ============================================================================
 * Un conteo ciego que no era ciego
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * El conteo físico de inventario nace ciego —la pantalla sólo sabe abrirlo así,
 * `conteoCiego: true`— y su propio modal lo promete con estas palabras:
 *
 *     «Conteo ciego: captura físicamente cada posición sin mostrar la
 *      existencia teórica.»
 *
 * Y el servidor mandaba la existencia teórica al navegador en cada posición.
 * `obtenerConteo` devuelve la entidad completa, con `existenciaTeorica`, sin
 * mirar si el conteo es ciego. La pantalla no la pinta, y ahí acababa el
 * control: la ceguera la sostenía una columna que nadie dibuja, no el servidor.
 *
 * POR QUÉ IMPORTA
 *
 * Un conteo ciego existe por una sola razón: que quien cuenta no pueda ajustar
 * su conteo a la cifra esperada. Y quien cuenta es, muchas veces, la única
 * persona con acceso al rack. Si el número viaja al navegador, cualquiera que
 * abra las herramientas del desarrollador —o cualquier guion— lo tiene, y el
 * conteo deja de servir para lo que se hace: detectar faltantes que alguien
 * preferiría que no se detectaran.
 *
 * Es el mismo defecto de siempre con otro disfraz: un control que se ve
 * aplicado y no lo está. Aquí ni siquiera hacía falta un error de lógica, sólo
 * confiar en que la vista se porte bien.
 *
 * QUÉ SE HIZO
 *
 * Mientras el conteo ADMITE CAPTURA y es ciego, el servidor no manda la
 * existencia teórica ni la diferencia. En cuanto se captura —el estado pasa a
 * `PENDIENTE_AUTORIZACION` y ya no se puede volver a capturar— se mandan las
 * dos: quien autoriza necesita verlas, y la bitácora también.
 * ============================================================================
 */

import { EstadoConteoInventario } from './entities/conteo-inventario.entity';
import { WmsService } from './services/wms.service';

describe('un conteo ciego que no era ciego', () => {
  /** Un conteo con una posición, en el estado que se pida. */
  function conteo(estado: EstadoConteoInventario, ciego: boolean) {
    return {
      id: 'c1',
      empresaId: 'e1',
      folio: 'CNT-1',
      estado,
      conteoCiego: ciego,
      detalles: [
        {
          id: 'd1',
          productoId: 'p1',
          existenciaTeorica: 10,
          primerConteo: null,
          reconteo: null,
          cantidadFinal: null,
          diferencia: 0,
          producto: { nombre: 'Taza de cerámica' },
        },
      ],
    };
  }

  /**
   * El servicio tiene muchas dependencias y ninguna hace falta aquí: se
   * construye vacío y se le pone el único repositorio que esta prueba toca.
   * Es más honesto que un módulo de Nest entero para leer un campo.
   */
  function conFila(fila: unknown): WmsService {
    const s = Object.create(WmsService.prototype) as Record<string, unknown>;
    s.conteos = { findOne: () => Promise.resolve(fila) };
    return s as unknown as WmsService;
  }

  /** Lo que devuelve el servicio, visto como datos sueltos. */
  const leer = async (s: WmsService) =>
    (await s.obtenerConteo('e1', 'c1')) as unknown as {
      detalles: Array<Record<string, unknown>>;
    };

  it('mientras admite captura, un conteo ciego no revela la existencia teórica', async () => {
    for (const estado of [
      EstadoConteoInventario.ABIERTO,
      EstadoConteoInventario.EN_CONTEO,
    ]) {
      const s = conFila(conteo(estado, true));
      const c = await leer(s);
      const d = c.detalles[0];
      expect(d.existenciaTeorica).toBeUndefined();
      expect(d.diferencia).toBeUndefined();
      // Lo que sí necesita quien cuenta: qué producto y dónde.
      expect(d.producto).toBeDefined();
      expect(d.id).toBe('d1');
    }
  });

  it('una vez capturado, se revela: quien autoriza tiene que verlo', async () => {
    const s = conFila(
      conteo(EstadoConteoInventario.PENDIENTE_AUTORIZACION, true),
    );
    const c = await leer(s);
    expect(c.detalles[0].existenciaTeorica).toBe(10);
  });

  it('un conteo cerrado se lee entero, que es la bitácora', async () => {
    const s = conFila(conteo(EstadoConteoInventario.CERRADO, true));
    const c = await leer(s);
    expect(c.detalles[0].existenciaTeorica).toBe(10);
  });

  it('un conteo que NO es ciego enseña la teórica desde el principio', async () => {
    const s = conFila(conteo(EstadoConteoInventario.ABIERTO, false));
    const c = await leer(s);
    expect(c.detalles[0].existenciaTeorica).toBe(10);
  });
});
