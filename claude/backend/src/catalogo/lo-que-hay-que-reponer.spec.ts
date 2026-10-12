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
/**
 * La existencia de un producto, como la ve el resumen de stock. Un número
 * suelto significa «todo físico y nada apartado», que es como estaba escrita
 * cada prueba antes de que la reposición mirara lo disponible.
 */
type Existencia = number | { fisico: number; reservado?: number; bloqueado?: number };

const servicioCon = (
  productos: any[],
  stocks: Record<string, Existencia>,
  /** Lo que los clientes esperan y no hay: el backorder de los pedidos. */
  enEspera: Record<string, number> = {},
): { servicio: ProductosService; relacionesPedidas: string[][] } => {
  const relacionesPedidas: string[][] = [];
  const qb: any = {
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    groupBy: () => qb,
    getRawMany: async () =>
      Object.entries(stocks).map(([productoId, e]) => ({
        productoId,
        totalStock: String(typeof e === 'number' ? e : e.fisico),
        totalReservado: String(typeof e === 'number' ? 0 : (e.reservado ?? 0)),
        totalBloqueado: String(typeof e === 'number' ? 0 : (e.bloqueado ?? 0)),
      })),
  };
  const productoRepository: any = {
    find: async (opciones: any) => {
      relacionesPedidas.push(opciones?.relations ?? []);
      return productos;
    },
  };
  const dataSource: any = {
    getRepository: () => ({ createQueryBuilder: () => qb }),
    /* El backorder sale de los pedidos de venta con una consulta propia. */
    query: async () =>
      Object.entries(enEspera).map(([productoId, cantidad]) => ({
        productoId,
        enEspera: cantidad,
      })),
  };
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
  stocks: Record<string, Existencia> = {},
  opciones: Parameters<ProductosService['analizarReposicion']>[1] = {},
  enEspera: Record<string, number> = {},
) =>
  servicioCon(productos, stocks, enEspera).servicio.analizarReposicion(
    EMPRESA,
    opciones,
  );

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

describe('Se repone lo que se puede VENDER, no lo que está en el edificio', () => {
  /*
   * ==========================================================================
   * EL HUECO QUE ABRIÓ EL PEDIDO DE VENTA
   * --------------------------------------------------------------------------
   * Hasta el 12-oct-2026 esta lista miraba `cantidad`: lo FÍSICO. Un producto
   * con 50 piezas en el anaquel, las 50 apartadas para el pedido de un cliente
   * y punto de reorden 20, no salía en la lista. El ERP veía 50 contra 20 y
   * callaba, mientras el mostrador no tenía ni una que vender.
   *
   * El hueco existía desde que el WMS podía apartar; se volvió grave cuando
   * nació el pedido de venta, que aparta de verdad y en volumen.
   * ==========================================================================
   */
  it('lo apartado no cuenta como existencia para decidir la compra', async () => {
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20, stockMaximo: 60 })],
      { p1: { fisico: 50, reservado: 50 } },
    );
    expect(renglones).toHaveLength(1);
    expect(renglones[0].disponible).toBe(0);
    /* Y se enseñan los tres: «tengo 50 y no puedo vender ninguna» no es lo
       mismo que «no tengo nada», y se trabajan distinto. */
    expect(renglones[0].stockActual).toBe(50);
    expect(renglones[0].comprometido).toBe(50);
    expect(renglones[0].estado).toBe('AGOTADO');
    /* Y se pide hasta el máximo contra lo disponible, no contra lo físico. */
    expect(renglones[0].sugerido).toBe(60);
  });

  it('lo bloqueado por el almacén cuenta igual que lo reservado', async () => {
    /* Mercancía en cuarentena está en el edificio y no se puede vender. Para
       decidir la compra es exactamente lo mismo que si no estuviera. */
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 10 })],
      { p1: { fisico: 30, bloqueado: 25 } },
    );
    expect(renglones).toHaveLength(1);
    expect(renglones[0].disponible).toBe(5);
  });

  it('con todo libre se comporta exactamente como antes', async () => {
    /*
     * La mitad que no debe cambiar. Una instalación sin apartados ni pedidos
     * tiene que ver la misma lista de siempre: el cambio corrige lo que se
     * medía mal, no mueve el umbral de nadie.
     */
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20, stockMaximo: 100 })],
      { p1: { fisico: 15, reservado: 0 } },
    );
    expect(renglones[0].disponible).toBe(15);
    expect(renglones[0].sugerido).toBe(85);
  });

  it('un resumen inconsistente no produce una sugerencia absurda', async () => {
    /* Si lo reservado superara a lo físico —un resumen que se descuadró—, el
       disponible negativo inflaría el faltante con un número inventado. */
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 10, stockMaximo: 40 })],
      { p1: { fisico: 10, reservado: 30 } },
    );
    expect(renglones[0].disponible).toBe(0);
    expect(renglones[0].sugerido).toBe(40);
  });
});

describe('Lo que un cliente ya está esperando es una necesidad de compra', () => {
  it('el backorder se SUMA al faltante, no se compara con él', async () => {
    /*
     * Si sólo se repusiera hasta el objetivo, la mercancía entraría y se iría
     * entera al pedido pendiente: el anaquel quedaría igual de vacío que antes
     * y la lista diría que ya se repuso. Son dos necesidades distintas.
     */
    const { renglones } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20, stockMaximo: 100 })],
      { p1: 15 },
      {},
      { p1: 30 },
    );
    expect(renglones[0].enEspera).toBe(30);
    /* 85 para volver al máximo + 30 que ya están prometidas. */
    expect(renglones[0].sugerido).toBe(115);
  });

  it('entra en la lista aunque el umbral no se haya tocado', async () => {
    /*
     * Existencia cómoda, muy por encima del reorden, y un cliente esperando
     * veinte piezas que no se le pudieron apartar. Sin esto, la promesa con
     * fecha no aparecería en ninguna lista de compra.
     */
    const { renglones, resumen } = await analizar(
      [producto({ id: 'p1', puntoReorden: 10, stockMaximo: 50 })],
      { p1: 45 },
      {},
      { p1: 20 },
    );
    expect(renglones).toHaveLength(1);
    expect(renglones[0].sugerido).toBe(25);
    expect(resumen.conClienteEsperando).toBe(1);
  });

  it('sin pedidos pendientes el resumen no inventa urgencias', async () => {
    const { resumen } = await analizar(
      [producto({ id: 'p1', puntoReorden: 20 })],
      { p1: 5 },
    );
    expect(resumen.conClienteEsperando).toBe(0);
  });
});
