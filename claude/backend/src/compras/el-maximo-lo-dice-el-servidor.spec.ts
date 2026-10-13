import { readFileSync } from 'fs';
import { join } from 'path';

import { maximoAPagar } from './utils/el-maximo-a-pagar';

/**
 * ============================================================================
 * El máximo lo dice el servidor, la pantalla lo enseña
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * La pantalla de pago a proveedores tenía su propia copia de la regla del
 * servidor, para precargar el importe y escribir «Máximo a pagar ahora». El
 * comentario de esa copia decía, con todas sus letras: «Se calcula igual que
 * en el servidor».
 *
 * Dejó de ser verdad dos veces, sin que nada se rompiera:
 *
 *   · el servidor empezó a restar las DEVOLUCIONES vigentes al proveedor, y la
 *     pantalla siguió ofreciendo pagar mercancía ya devuelta;
 *   · el servidor empezó a topar con lo FACTURADO, y la pantalla siguió
 *     ofreciendo pagar sin comprobante.
 *
 * Las dos veces el pago se rechazaba con un mensaje correcto —después de que
 * alguien tecleara una cifra que la propia pantalla había propuesto—. Es el
 * patrón de la casa en dos lenguajes: la pieza buena existe y el camino real
 * no la usa.
 *
 * LO QUE ESTAS PRUEBAS FIJAN
 *
 * Que el número salga de un solo sitio —`utils/el-maximo-a-pagar.ts`—, que lo
 * usen tanto el pago como el listado que alimenta la pantalla, y que la
 * pantalla no vuelva a deducirlo por su cuenta.
 * ============================================================================
 */

const SRC = join(__dirname, '..');
const FRONT = join(SRC, '..', '..', 'frontend');
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Un `EntityManager` con lo justo: las dos consultas que esto hace. */
const emCon = (datos: {
  devuelto?: number;
  facturas?: { cuantas: number; total: number; iva: number; conDiferencias?: string[] } | null;
}) =>
  ({
    query: async (sql: string) => {
      if (/facturas_proveedor/i.test(sql)) {
        const f = datos.facturas;
        return f
          ? [{ cuantas: f.cuantas, total: f.total, iva: f.iva, conDiferencias: f.conDiferencias ?? [] }]
          : [{ cuantas: 0, total: 0, iva: 0, conDiferencias: [] }];
      }
      if (/devoluciones_proveedor/i.test(sql)) {
        return [{ devuelto: String(datos.devuelto ?? 0) }];
      }
      return [];
    },
  }) as never;

/** 100 piezas a $100 + IVA, recibidas completas: $11,600. */
const ORDEN = (totalPagado = 0) => ({
  id: 'oc1',
  totalPagado,
  detalles: [
    { cantidad: 100, cantidadRecibidaOk: 100, subtotal: 10000, impuestoImporte: 1600 },
  ],
});

describe('Compras · el máximo a pagar sale de un solo sitio', () => {
  it('sin facturas capturadas, el techo es lo recibido', async () => {
    /*
     * La mitad del diseño: un documento nuevo no apaga la operación. Quien no
     * captura facturas queda exactamente como estaba.
     */
    const r = await maximoAPagar(emCon({ facturas: null }), 'e1', ORDEN());
    expect([r.maximo, r.facturado, r.aprieta]).toEqual([11600, null, 'RECIBIDO']);
  });

  it('con una factura menor, el techo es la factura y lo dice', async () => {
    const r = await maximoAPagar(
      emCon({ facturas: { cuantas: 1, total: 5800, iva: 800 } }),
      'e1',
      ORDEN(),
    );
    expect([r.maximo, r.aprieta, r.cuantasFacturas]).toEqual([5800, 'FACTURADO', 1]);
    expect(r.recibido).toBe(11600);
  });

  it('con una factura mayor que lo recibido, manda lo recibido', async () => {
    /* Se paga el MENOR de los dos. Facturar de más no abre la puerta. */
    const r = await maximoAPagar(
      emCon({ facturas: { cuantas: 2, total: 20000, iva: 2758 } }),
      'e1',
      ORDEN(),
    );
    expect([r.maximo, r.aprieta]).toEqual([11600, 'RECIBIDO']);
  });

  it('lo devuelto al proveedor baja el máximo', async () => {
    /*
     * El caso que la pantalla no sabía: se devuelven 50 piezas, su nota de
     * crédito es $5,800, y seguía ofreciendo pagar $11,600.
     */
    const r = await maximoAPagar(emCon({ devuelto: 5800, facturas: null }), 'e1', ORDEN());
    expect([r.recibido, r.maximo]).toEqual([5800, 5800]);
  });

  it('lo ya pagado se resta, y nunca sale negativo', async () => {
    const r = await maximoAPagar(emCon({ facturas: null }), 'e1', ORDEN(11600));
    expect([r.maximo, r.aprieta]).toEqual([0, 'PAGADO']);

    const dePlano = await maximoAPagar(emCon({ facturas: null }), 'e1', ORDEN(99999));
    expect(dePlano.maximo).toBe(0);
  });

  it('las facturas con diferencias viajan con el límite', async () => {
    /* Para que la pantalla pueda nombrarlas antes del rechazo, no después. */
    const r = await maximoAPagar(
      emCon({
        facturas: { cuantas: 2, total: 5800, iva: 800, conDiferencias: ['FP-2026-000002'] },
      }),
      'e1',
      ORDEN(),
    );
    expect(r.conDiferencias).toEqual(['FP-2026-000002']);
  });

  describe('y hay un solo sitio donde se calcula', () => {
    it('el pago y el listado usan la misma pieza', () => {
      const servicio = sinComentarios(
        readFileSync(join(SRC, 'compras/services/ordenes-compra.service.ts'), 'utf8'),
      );
      expect(servicio).toMatch(/from '\.\.\/utils\/el-maximo-a-pagar'/);
      /* `pagarOrden` y `obtenerPorPagar`, las dos. */
      expect((servicio.match(/maximoAPagar\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it('la pantalla pide el número, no lo deduce', () => {
      const pantalla = sinComentarios(
        readFileSync(
          join(FRONT, 'app/dashboard/compras/pago-proveedores/page.tsx'),
          'utf8',
        ),
      );
      /* Pide el listado que ya trae el límite calculado. */
      expect(pantalla).toMatch(/compras\/ordenes\/por-pagar/);
      /*
       * Y no rehace la cuenta. `cantidadRecibidaOk` es el ingrediente de la
       * regla del servidor: si vuelve a aparecer en una operación aritmética
       * de esta pantalla, la copia ha vuelto.
       */
      expect(pantalla).not.toMatch(/cantidadRecibidaOk[\s\S]{0,120}\/\s*ordenada/);
      expect(pantalla).toMatch(/o\.limite\?\.maximo/);
    });
  });
});
