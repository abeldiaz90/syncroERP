/**
 * ============================================================================
 * El almacén no saca de donde no está (y una entrada nueva no alarga vidas)
 * ----------------------------------------------------------------------------
 * Dos defectos del mismo archivo, los dos del barrido del 6-oct y ninguno
 * verificado hasta hoy.
 *
 * ── 26 · La salida desde una posición donde el lote no está ─────────────────
 * `registrarSalida` consulta las posiciones del lote y, si no encuentra
 * ninguna, concluye «lote legado, sin WMS» y descuenta del lote completo. Esa
 * conclusión vale cuando la consulta mira TODAS las posiciones. Cuando quien
 * llama pidió una posición concreta, la consulta lleva su filtro, y «sin filas»
 * pasa a significar lo contrario: el lote SÍ está localizado, pero en otro
 * sitio.
 *
 * Se descontaba del lote sin tocar una sola fila de `stock_ubicaciones`: el
 * total del almacén bajaba y lo ubicado no. A partir de ahí el almacén tiene
 * más mercancía localizada que existente, para siempre.
 *
 * ── 30 · La caducidad que se empujaba hacia adelante ────────────────────────
 * `obtenerOCrearLote` reescribía la caducidad del lote con la de cada entrada
 * nueva. Como el número de lote por omisión es `'ÚNICO'`, casi todas las
 * entradas de un producto caen en el mismo lote: la mercancía vieja heredaba la
 * fecha de la nueva y el consumo por caducidad dejaba de sacarla a tiempo.
 * ============================================================================
 */
import { InventarioService } from './inventario.service';
import { Almacen } from '../entities/almacen.entity';
import { Producto } from '../entities/producto.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { StockUbicacion } from '../entities/stock-ubicacion.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';
import { UbicacionAlmacen } from '../entities/ubicacion-almacen.entity';

const EMPRESA = 'empresa-1';
const PRODUCTO = 'prod-1';
const ALMACEN = 'alm-1';

type Config = {
  /** Filas de posición que devuelve la consulta CON filtro de ubicación. */
  enLaUbicacionPedida: any[];
  /** Cuántas posiciones tiene el lote en todo el almacén. */
  posicionesDelLote: number;
  lote: any;
};

function armar(cfg: Config) {
  const guardados: any[] = [];

  const qb = (entidad: unknown): any => {
    const api: any = {};
    for (const metodo of ['setLock', 'where', 'andWhere', 'orderBy', 'select']) {
      api[metodo] = () => api;
    }
    api.getOne = async () =>
      entidad === StockPorAlmacen
        ? { empresaId: EMPRESA, productoId: PRODUCTO, almacenId: ALMACEN, cantidad: 100, reservado: 0, bloqueado: 0 }
        : null;
    api.getMany = async () => (entidad === LoteInventario ? [cfg.lote] : cfg.enLaUbicacionPedida);
    api.getCount = async () => cfg.posicionesDelLote;
    api.getRawOne = async () => ({ total: 0 });
    return api;
  };

  const em: any = {
    findOne: async (entidad: unknown) => {
      if (entidad === Almacen) return { id: ALMACEN, empresaId: EMPRESA };
      if (entidad === Producto) return { id: PRODUCTO, nombre: 'Café', categoria: {} };
      if (entidad === UbicacionAlmacen) return { id: 'ub-B', almacenId: ALMACEN, activo: true };
      return null;
    },
    createQueryBuilder: (entidad: unknown) => qb(entidad),
    create: (_e: unknown, x: unknown) => x,
    save: async (x: unknown) => { guardados.push(x); return x; },
    find: async () => [],
  };

  const stockService: any = { sincronizarResumen: jest.fn(async () => undefined) };
  const repo: any = {};
  const servicio = new InventarioService(
    repo, repo, repo, repo, repo, repo, stockService, {} as any, {} as any,
  );

  return { servicio, em, guardados, stockService };
}

describe('Salida de inventario · la posición que se pide es la posición de la que se saca', () => {
  it('no descuenta del lote cuando el lote está localizado en OTRA posición', async () => {
    const lote = { id: 'lote-1', numeroLote: 'L1', stockRestante: 100, costoUnitario: 50, fechaIngreso: new Date(), fechaCaducidad: null };
    const { servicio, em, guardados, stockService } = armar({
      enLaUbicacionPedida: [],   // en la posición pedida no hay nada de este lote
      posicionesDelLote: 1,      // pero el lote SÍ está localizado, en otra
      lote,
    });

    await expect(
      servicio.registrarSalida(PRODUCTO, ALMACEN, 10, 'Venta', EMPRESA, undefined, undefined, em, undefined, 'ub-B'),
    ).rejects.toThrow(/Stock insuficiente en la ubicación seleccionada/);

    // Lo que de verdad se vigila: el lote no se tocó y nada se guardó.
    expect(lote.stockRestante).toBe(100);
    expect(guardados).toEqual([]);
    expect(stockService.sincronizarResumen).not.toHaveBeenCalled();
  });

  it('un lote legado SIN ninguna posición sigue saliendo por lote', async () => {
    /*
     * El arreglo no puede cerrarle la puerta al caso para el que se escribió la
     * rama: existencias cargadas antes de que el almacén estrenara posiciones.
     */
    const lote = { id: 'lote-2', numeroLote: 'L2', stockRestante: 100, costoUnitario: 50, fechaIngreso: new Date(), fechaCaducidad: null };
    const { servicio, em } = armar({
      enLaUbicacionPedida: [],
      posicionesDelLote: 0,
      lote,
    });

    const salida = await servicio.registrarSalida(
      PRODUCTO, ALMACEN, 10, 'Venta', EMPRESA, undefined, undefined, em, undefined, 'ub-B',
    );
    expect(salida.cantidadTotal).toBe(10);
    expect(lote.stockRestante).toBe(90);
  });

  it('con existencia en la posición pedida, sale de ahí', async () => {
    const fila = { id: 'su-1', cantidad: 40, reservado: 0 };
    const lote = { id: 'lote-3', numeroLote: 'L3', stockRestante: 100, costoUnitario: 50, fechaIngreso: new Date(), fechaCaducidad: null };
    const { servicio, em } = armar({
      enLaUbicacionPedida: [fila],
      posicionesDelLote: 1,
      lote,
    });

    await servicio.registrarSalida(PRODUCTO, ALMACEN, 10, 'Venta', EMPRESA, undefined, undefined, em, undefined, 'ub-B');
    expect(fila.cantidad).toBe(30);
    expect(lote.stockRestante).toBe(90);
  });
});

describe('Lote compartido · la caducidad que se guarda es la más próxima', () => {
  function servicioSuelto() {
    const repo: any = {};
    return new InventarioService(repo, repo, repo, repo, repo, repo, {} as any, {} as any, {} as any);
  }

  function emConLote(lote: any) {
    return {
      findOne: async () => lote,
      create: (_e: unknown, x: any) => x,
      save: async (x: unknown) => x,
    } as any;
  }

  it('una entrada que vence después NO alarga la vida del lote', async () => {
    const lote = { id: 'l', numeroLote: 'ÚNICO', fechaCaducidad: new Date('2026-10-19') };
    const servicio = servicioSuelto();
    await (servicio as any).obtenerOCrearLote(
      emConLote(lote), PRODUCTO, ALMACEN, EMPRESA, 'ÚNICO', new Date('2027-10-19'),
    );
    expect(new Date(lote.fechaCaducidad).toISOString().slice(0, 10)).toBe('2026-10-19');
  });

  it('una entrada que vence antes SÍ la adelanta', async () => {
    /*
     * Adelantarla es prudente: obliga a sacar el lote antes. Retrasarla afirma
     * algo que nadie sabe sobre piezas que ya estaban.
     */
    const lote = { id: 'l', numeroLote: 'ÚNICO', fechaCaducidad: new Date('2027-10-19') };
    const servicio = servicioSuelto();
    await (servicio as any).obtenerOCrearLote(
      emConLote(lote), PRODUCTO, ALMACEN, EMPRESA, 'ÚNICO', new Date('2026-10-19'),
    );
    expect(new Date(lote.fechaCaducidad).toISOString().slice(0, 10)).toBe('2026-10-19');
  });

  it('un lote sin caducidad la toma de la entrada', async () => {
    const lote = { id: 'l', numeroLote: 'ÚNICO', fechaCaducidad: null };
    const servicio = servicioSuelto();
    await (servicio as any).obtenerOCrearLote(
      emConLote(lote), PRODUCTO, ALMACEN, EMPRESA, 'ÚNICO', new Date('2026-12-01'),
    );
    expect(new Date(lote.fechaCaducidad!).toISOString().slice(0, 10)).toBe('2026-12-01');
  });
});
