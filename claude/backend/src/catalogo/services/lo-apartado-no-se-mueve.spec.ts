/**
 * ============================================================================
 * Lo apartado no se mueve, y «sin lote» hay que pedirlo
 * ----------------------------------------------------------------------------
 * ── 28 · `reubicar` ignoraba `reservado` ────────────────────────────────────
 * La comprobación miraba `cantidad` a secas. `StockUbicacion` tiene además
 * `reservado`: las unidades que una transferencia o una venta ya apartaron en
 * esa posición. Se podían mover, y el `reservado` no viajaba con ellas: el
 * origen quedaba con una reserva sobre mercancía que ya no está ahí, y en el
 * destino las mismas unidades aparecían libres. Vendibles dos veces.
 *
 * ── 29 · `loteId: undefined` no es «sin lote» ───────────────────────────────
 * TypeORM descarta del `where` las claves con valor `undefined`. La consulta
 * que buscaba la fila SIN lote de una posición quedaba como «cualquier lote» y
 * devolvía la primera fila del producto ahí —casi siempre una CON lote—, a la
 * que se le sumaba el excedente sin lote. Ese lote pasaba a decir que tiene en
 * la posición unidades que no son suyas: la trazabilidad miente, y miente
 * hacia arriba.
 * ============================================================================
 */
import { WmsService } from './wms.service';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { StockUbicacion } from '../entities/stock-ubicacion.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';
import { UbicacionAlmacen, EstadoUbicacionAlmacen } from '../entities/ubicacion-almacen.entity';

const EMPRESA = 'empresa-1';

function servicio(em: any) {
  const repo: any = {};
  const dataSource: any = { transaction: (fn: any) => fn(em) };
  return new WmsService(
    dataSource, {} as any, {} as any,
    repo, repo, repo, repo, repo, repo, repo, repo, repo,
  );
}

describe('Reubicar · lo que otro documento tiene apartado', () => {
  function armar(origen: any) {
    const guardados: any[] = [];
    const qb = (entidad: unknown): any => {
      const api: any = {};
      for (const m of ['setLock', 'where', 'andWhere', 'select', 'orderBy']) api[m] = () => api;
      api.getOne = async () => (entidad === StockUbicacion ? origen : null);
      api.getRawOne = async () => ({ total: 0 });
      api.getMany = async () => [];
      return api;
    };
    const em: any = {
      createQueryBuilder: (e: unknown) => qb(e),
      findOne: async (entidad: unknown) =>
        entidad === UbicacionAlmacen
          ? { id: 'ub-destino', almacenId: 'alm-1', empresaId: EMPRESA, activo: true, estado: EstadoUbicacionAlmacen.DISPONIBLE, capacidadMaxima: 0 }
          : null,
      create: (_e: unknown, x: unknown) => x,
      save: async (x: unknown) => { guardados.push(x); return x; },
      find: async () => [],
    };
    const wms = servicio(em);
    (wms as any).asegurarSlotting = jest.fn(async () => ({ capacidadAsignada: 0 }));
    return { wms, guardados };
  }

  const dto = { stockUbicacionId: 'su-1', ubicacionDestinoId: 'ub-destino', cantidad: 10 };

  it('no deja mover unidades apartadas', async () => {
    const origen = { id: 'su-1', empresaId: EMPRESA, productoId: 'p', almacenId: 'alm-1', ubicacionId: 'ub-origen', cantidad: 12, reservado: 8, estado: 'DISPONIBLE', loteId: 'l1' };
    const { wms, guardados } = armar(origen);

    await expect(wms.reubicar(EMPRESA, 'u1', dto)).rejects.toThrow(/Disponible: 4/);
    expect(origen.cantidad).toBe(12);
    expect(guardados).toEqual([]);
  });

  it('la negativa dice cuántas están apartadas, para saber qué documento las tiene', async () => {
    const origen = { id: 'su-1', empresaId: EMPRESA, productoId: 'p', almacenId: 'alm-1', ubicacionId: 'ub-origen', cantidad: 12, reservado: 8, estado: 'DISPONIBLE', loteId: 'l1' };
    const { wms } = armar(origen);
    await expect(wms.reubicar(EMPRESA, 'u1', dto)).rejects.toThrow(/8 apartadas/);
  });

  it('lo que está libre sí se mueve', async () => {
    const origen = { id: 'su-1', empresaId: EMPRESA, productoId: 'p', almacenId: 'alm-1', ubicacionId: 'ub-origen', cantidad: 12, reservado: 2, estado: 'DISPONIBLE', loteId: 'l1' };
    const { wms } = armar(origen);
    const r: any = await wms.reubicar(EMPRESA, 'u1', dto);
    expect(r.cantidad).toBe(10);
    expect(origen.cantidad).toBe(2);
  });
});

describe('Ubicar lo que no tenía posición · la fila sin lote se pide sin lote', () => {
  it('la consulta pregunta por loteId NULO, no por «cualquier lote»', async () => {
    const consultas: any[] = [];
    const creadas: any[] = [];
    const qb = (entidad: unknown): any => {
      const api: any = {};
      for (const m of ['setLock', 'where', 'andWhere', 'select', 'orderBy']) api[m] = () => api;
      api.getOne = async () =>
        entidad === StockPorAlmacen ? { cantidad: 50, productoId: 'p', almacenId: 'alm-1' } : null;
      api.getRawOne = async () => ({ total: 0 });
      api.getMany = async () => [];
      return api;
    };
    const em: any = {
      createQueryBuilder: (e: unknown) => qb(e),
      findOne: async (entidad: unknown, opciones?: any) => {
        if (entidad === UbicacionAlmacen)
          return { id: 'ub-destino', almacenId: 'alm-1', empresaId: EMPRESA, activo: true, estado: EstadoUbicacionAlmacen.DISPONIBLE, capacidadMaxima: 0 };
        if (entidad === StockUbicacion) { consultas.push(opciones?.where); return null; }
        return null;
      },
      find: async (entidad: unknown) => (entidad === LoteInventario ? [] : []),
      create: (_e: unknown, x: any) => { creadas.push(x); return x; },
      save: async (x: unknown) => x,
    };
    const wms = servicio(em);
    (wms as any).asegurarSlotting = jest.fn(async () => ({ capacidadAsignada: 0 }));

    await wms.reubicar(EMPRESA, 'u1', { productoId: 'p', almacenId: 'alm-1', ubicacionDestinoId: 'ub-destino', cantidad: 5 });

    expect(consultas.length).toBe(1);
    const lote = consultas[0]?.loteId;
    /*
     * La aserción es sobre lo que se le PIDE a la base. `undefined` aquí es el
     * defecto entero: TypeORM lo borra del `where` y la consulta deja de
     * distinguir la fila sin lote de cualquier otra.
     */
    expect(lote).toBeDefined();
    expect(typeof lote).toBe('object');
    expect(String((lote as any)?.type ?? '')).toBe('isNull');

    // Y la fila que se crea nace sin lote, no con uno inventado.
    const creada = creadas.find((c) => 'cantidad' in c && c.ubicacionId === 'ub-destino');
    expect(creada?.loteId ?? null).toBeNull();
  });
});
