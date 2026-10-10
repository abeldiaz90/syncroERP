/**
 * ============================================================================
 * Borrar una lista se llevaba miles de precios, en silencio
 * ----------------------------------------------------------------------------
 * `ProductoPrecio.listaPrecio` está declarado `onDelete: 'CASCADE'`, así que
 * borrar la fila de la lista arrastraba TODOS sus precios: en una instalación
 * con catálogo completo, miles de renglones capturados a mano durante meses.
 * Sin confirmación, sin contarlos y sin aviso, desde un botón de papelera en un
 * renglón de una tabla. Y sin reversa: no están en ningún otro sitio.
 *
 * Además la lista la pueden estar apuntando una venta —documento fiscal que
 * dejaría de poder explicar a qué precio se vendió— o una caja que cobra con
 * ella.
 * ============================================================================
 */
import { ConflictException } from '@nestjs/common';

import { ListasPrecioService } from './listas-precio.service';

const EMPRESA = 'empresa-1';

function armar(conteos: { ventas: number; cajas: number; precios: number }) {
  const lista: any = { id: 'lp-1', empresaId: EMPRESA, nombre: 'Mostrador', esPorDefecto: false };
  const borradas: any[] = [];
  const listaRepo: any = { findOne: async () => lista };
  const dataSource: any = {
    query: async (sql: string) => {
      if (/FROM ventas/.test(sql)) return [{ total: conteos.ventas }];
      if (/FROM cuentas_bancarias/.test(sql)) return [{ total: conteos.cajas }];
      if (/FROM productos_precios/.test(sql)) return [{ total: conteos.precios }];
      throw new Error(`consulta no prevista: ${sql}`);
    },
    transaction: async (fn: any) =>
      fn({
        getRepository: () => ({
          remove: async (x: unknown) => { borradas.push(x); return x; },
          findOne: async () => null,
          save: async (x: unknown) => x,
        }),
      }),
  };
  return { servicio: new ListasPrecioService(listaRepo, dataSource), borradas, lista };
}

describe('Listas de precio · borrar no es gratis', () => {
  it('una lista con ventas no se borra nunca', async () => {
    const { servicio, borradas } = armar({ ventas: 12, cajas: 0, precios: 0 });
    await expect(servicio.eliminarLista('lp-1', EMPRESA, true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(borradas).toEqual([]);
  });

  it('una lista con la que cobra una caja tampoco, y dice cuántas', async () => {
    const { servicio, borradas } = armar({ ventas: 0, cajas: 2, precios: 0 });
    await expect(servicio.eliminarLista('lp-1', EMPRESA, true)).rejects.toThrow(/2 caja/);
    expect(borradas).toEqual([]);
  });

  it('con precios dentro, hace falta confirmar, y el número va por delante', async () => {
    const { servicio, borradas } = armar({ ventas: 0, cajas: 0, precios: 4312 });
    await expect(servicio.eliminarLista('lp-1', EMPRESA)).rejects.toThrow(/4312 precio/);
    expect(borradas).toEqual([]);
  });

  it('confirmada, se borra y se dice cuántos precios se fueron', async () => {
    const { servicio, borradas } = armar({ ventas: 0, cajas: 0, precios: 4312 });
    const r: any = await servicio.eliminarLista('lp-1', EMPRESA, true);
    expect(borradas.length).toBe(1);
    expect(r.preciosBorrados).toBe(4312);
  });

  it('una lista vacía se borra sin ceremonia', async () => {
    const { servicio, borradas } = armar({ ventas: 0, cajas: 0, precios: 0 });
    await servicio.eliminarLista('lp-1', EMPRESA);
    expect(borradas.length).toBe(1);
  });
});
