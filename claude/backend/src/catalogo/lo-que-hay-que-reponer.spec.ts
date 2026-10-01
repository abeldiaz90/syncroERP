/**
 * ============================================================================
 * Lo que hay que reponer
 * ----------------------------------------------------------------------------
 * El ERP pedía `stockMinimo`, `puntoReorden`, `stockMaximo` y
 * `cantidadMinimaPedido` en la ficha de cada producto desde el primer día. El
 * 30-sep-2026 comprobé que **ninguna pantalla los usaba para nada**: había un
 * recuadro de «stock bajo» con los diez peores y se acababa ahí. O sea, cuatro
 * campos que se le piden a quien captura el catálogo y que no producían ni un
 * aviso. En una ferretería o una abarrotera eso es el módulo entero.
 *
 * `analizarReposicion` es la lista de trabajo. Estas pruebas cuidan las cuatro
 * decisiones que la hacen servir para algo, y que son justo las que se pierden
 * cuando alguien «simplifica» la consulta más adelante:
 *
 *   1. Dispara por PUNTO DE REORDEN, no por mínimo.
 *   2. Dice CUÁNTO pedir, redondeado al múltiplo de compra.
 *   3. Separa AGOTADO de CRÍTICO de BAJO.
 *   4. Confiesa cuántos artículos no pudo mirar.
 *
 * Se prueba el servicio de verdad —no el texto del archivo— con repositorios
 * falsos, porque lo que importa aquí es la aritmética, no cómo está escrita.
 * ============================================================================
 */
import { ProductosService } from './services/productos.service';
import { TipoProducto } from './entities/producto.entity';

const EMPRESA = 'empresa-1';

type Fila = Partial<{
  id: string;
  sku: string;
  nombre: string;
  tipo: TipoProducto;
  stockMinimo: number;
  stockMaximo: number;
  puntoReorden: number;
  cantidadMinimaPedido: number;
  precioCompra: number;
  unidadMedida: string;
}>;

/** Un producto con lo mínimo que la consulta mira. */
const producto = (f: Fila) =>
  ({
    id: f.id ?? 'p1',
    sku: f.sku ?? 'SKU-1',
    nombre: f.nombre ?? 'Artículo',
    tipo: f.tipo ?? TipoProducto.FISICO,
    stockMinimo: f.stockMinimo ?? 0,
    stockMaximo: f.stockMaximo ?? 0,
    puntoReorden: f.puntoReorden ?? 0,
    cantidadMinimaPedido: f.cantidadMinimaPedido ?? 0,
    precioCompra: f.precioCompra ?? 0,
    unidadMedida: f.unidadMedida ?? 'PIEZA',
    categoria: null,
    codigoProveedor: null,
  }) as any;

/**
 * El servicio con lo justo para que `analizarReposicion` corra: el repositorio
 * de productos y el `DataSource` del que sale la suma de existencias.
 */
const servicioCon = (
  productos: any[],
  stocks: Record<string, number>,
): { servicio: ProductosService; relacionesPedidas: string[][] } => {
  const relacionesPedidas: string[][] = [];
  const qb: any = {
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    groupBy: () => qb,
    getRawMany: async () =>
      Object.entries(stocks).map(([productoId, totalStock]) => ({
        productoId,
        totalStock: String(totalStock),
      })),
  };
  const productoRepository: any = {
    find: async (opciones: any) => {
      relacionesPedidas.push(opciones?.relations ?? []);
      return productos;
    },
  };
  const dataSource: any = { getRepository: () => ({ createQueryBuilder: () => qb }) };
  const servicio = new ProductosService(
    productoRepository,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    dataSource,
    null as any,
  );
  return { servicio, relacionesPedidas };
};

const analizar = (
  productos: any[],
  stocks: Record<string, number> = {},
  opciones: Parameters<ProductosService['analizarReposicion']>[1] = {},
) => servicioCon(productos, stocks).servicio.analizarReposicion(EMPRESA, opciones);

describe('El disparo es el punto de reorden, no el mínimo', () => {
  /*
   * La diferencia entre los dos no es un matiz: el mínimo es el suelo de
   * seguridad —«por debajo de aquí estoy en riesgo»— y el punto de reorden es
   * «pide YA, porque lo que queda se consume antes de que llegue el pedido».
   * Disparar por el mínimo es avisar cuando ya es tarde, que es exactamente lo
   * que hacía el recuadro viejo.
   */
  it('con existencia entre el mínimo y el reorden, ya entra a la lista', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', stockMinimo: 5, puntoReorden: 20 })],
      { p1: 12 },
    );
    expect(renglones.map((r) => r.id)).toEqual(['p1']);
    expect(renglones[0].umbral).toBe(20);
  });

  it('por encima del reorden no entra', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', stockMinimo: 5, puntoReorden: 20 })],
      { p1: 21 },
    );
    expect(renglones).toEqual([]);
  });

  it('justo EN el punto de reorden entra: el punto es «pide», no «espera»', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20 })],
      { p1: 20 },
    );
    expect(renglones).toHaveLength(1);
  });

  it('sin punto de reorden capturado, cae al mínimo', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', stockMinimo: 8, puntoReorden: 0 })],
      { p1: 8 },
    );
    expect(renglones).toHaveLength(1);
    expect(renglones[0].umbral).toBe(8);
  });
});

describe('Dice cuánto pedir, no sólo que falta', () => {
  it('llena hasta el máximo configurado', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20, stockMaximo: 100 })],
      { p1: 15 },
    );
    expect(renglones[0].sugerido).toBe(85);
  });

  it('sin máximo, el objetivo es el doble del umbral', async () => {
    /*
     * No es una cifra mágica: a falta de política capturada, reponer al doble
     * del punto de reorden deja un ciclo entero de holgura. Lo que NO puede
     * hacer es sugerir cero, que es lo que saldría tomando el umbral como
     * objetivo cuando la existencia ya está justo en él.
     */
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20, stockMaximo: 0 })],
      { p1: 20 },
    );
    expect(renglones[0].sugerido).toBe(20);
    expect(renglones[0].sugerido).toBeGreaterThan(0);
  });

  it('redondea HACIA ARRIBA al múltiplo de compra', async () => {
    /*
     * Nadie compra 7 cajas cuando el proveedor vende de 12. Redondear hacia
     * abajo dejaría el pedido corto y el artículo volvería a la lista mañana.
     */
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20, stockMaximo: 50, cantidadMinimaPedido: 12 })],
      { p1: 5 },
    );
    expect(renglones[0].sugerido).toBe(48);
  });

  it('y el costo estimado sale de lo sugerido, no de lo que falta', async () => {
    const { renglones, resumen } = await analizar(
      [producto({ id: 'p1', puntoReorden: 10, stockMaximo: 30, precioCompra: 12.5 })],
      { p1: 0 },
    );
    expect(renglones[0].costoSugerido).toBe(375);
    expect(resumen.costoEstimado).toBe(375);
  });
});

describe('Agotado, crítico y bajo no son lo mismo', () => {
  const catalogo = [
    producto({ id: 'agotado', stockMinimo: 5, puntoReorden: 20 }),
    producto({ id: 'critico', stockMinimo: 5, puntoReorden: 20 }),
    producto({ id: 'bajo', stockMinimo: 5, puntoReorden: 20 }),
  ];
  const existencias = { agotado: 0, critico: 3, bajo: 15 };

  it('cada uno recibe su estado', async () => {
    const { renglones } = await analizar(catalogo, existencias);
    const por = Object.fromEntries(renglones.map((r) => [r.id, r.estado]));
    expect(por).toEqual({ agotado: 'AGOTADO', critico: 'CRITICO', bajo: 'BAJO' });
  });

  it('lo urgente sale primero, sin que haya que ordenar la pantalla', async () => {
    const { renglones } = await analizar(catalogo, existencias);
    expect(renglones.map((r) => r.id)).toEqual(['agotado', 'critico', 'bajo']);
  });

  it('«sólo críticos» deja fuera los BAJO y nada más', async () => {
    const { renglones } = await analizar(catalogo, existencias, {
      soloCriticos: true,
    });
    expect(renglones.map((r) => r.id)).toEqual(['agotado', 'critico']);
  });

  it('el resumen cuenta los tres por separado', async () => {
    const { resumen } = await analizar(catalogo, existencias);
    expect(resumen).toMatchObject({
      total: 3,
      agotados: 1,
      criticos: 1,
      bajos: 1,
    });
  });
});

describe('Lo que la lista NO miró, lo dice', () => {
  /*
   * Éste es el punto que separa una lista útil de una mentira cómoda. Con la
   * mitad del catálogo sin umbrales capturados —que es el estado normal de
   * cualquier ERP recién sembrado— una lista vacía se lee como «no falta
   * nada». Y no: quiere decir «no miré nada».
   */
  it('cuenta los artículos sin mínimo ni reorden como no evaluados', async () => {
    const { renglones, resumen } = await analizar(
      [
        producto({ id: 'sin-umbral' }),
        producto({ id: 'con-umbral', puntoReorden: 10 }),
      ],
      { 'sin-umbral': 0, 'con-umbral': 50 },
    );
    expect(renglones).toEqual([]);
    expect(resumen.sinUmbralConfigurado).toBe(1);
    expect(resumen.productosEvaluados).toBe(1);
  });

  it('un artículo sin umbral NO se cuela con umbral cero', async () => {
    /*
     * Sin esta guardia, «existencia <= 0» lo metería en la lista como AGOTADO
     * permanente y el aviso quedaría enterrado en cientos de renglones que
     * nadie pidió vigilar.
     */
    const { renglones } = await analizar([producto({ id: 'p1' })], { p1: 0 });
    expect(renglones).toEqual([]);
  });

  it('los servicios no cuentan ni de un lado ni del otro', async () => {
    /*
     * Un servicio no se repone; tampoco «se quedó sin evaluar». Contarlo entre
     * los evaluados infla la frase «se evaluaron N artículos» con cosas que
     * nunca se miraron, y contarlo entre los no configurados pide capturarle un
     * punto de reorden a la mano de obra.
     */
    const { renglones, resumen } = await analizar(
      [
        producto({ id: 'servicio', tipo: TipoProducto.SERVICIO }),
        producto({ id: 'tornillo', puntoReorden: 10 }),
      ],
      { servicio: 0, tornillo: 2 },
    );
    expect(renglones.map((r) => r.id)).toEqual(['tornillo']);
    expect(resumen.sinUmbralConfigurado).toBe(0);
    expect(resumen.productosEvaluados).toBe(1);
  });
});

describe('La consulta pide relaciones que existen', () => {
  it('no pide `unidadMedidaRel`, que no es una relación', async () => {
    /*
     * `unidadMedida` es una columna de texto. Pedirla como relación tira la
     * consulta entera con «Relation was not found» y la pantalla queda en
     * blanco — un fallo que no aparece en ninguna prueba de texto y sólo se ve
     * abriendo la pantalla. Lo escribí así por costumbre y estuvo en el árbol
     * una hora.
     */
    const { servicio, relacionesPedidas } = servicioCon([], {});
    await servicio.analizarReposicion(EMPRESA);
    expect(relacionesPedidas).toEqual([['categoria']]);
  });

  it('la unidad sale del campo de texto del producto', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 10, unidadMedida: 'CAJA' })],
      { p1: 0 },
    );
    expect(renglones[0].unidad).toBe('CAJA');
  });
});
