import {
  cotejarTresVias,
  precioFueraDeTolerancia,
  TOLERANCIA_PRECIO_ABSOLUTA,
} from './el-cotejo-de-tres-vias';

/**
 * ============================================================================
 * TRES CIFRAS QUE TIENEN QUE DECIR LO MISMO
 * ----------------------------------------------------------------------------
 * Lo que estas pruebas fijan no es que la función corra, sino las cuatro
 * decisiones que la hacen un control y no un reporte:
 *
 *   1. El cotejo es POR RENGLÓN. El caso que lo justifica —y que un cotejo por
 *      totales deja pasar— está escrito en la primera prueba: una factura cuyo
 *      total cuadra al céntimo con la orden, inflando la partida cara y
 *      bajando la barata.
 *   2. Lo ya facturado por OTRAS facturas de la misma orden cuenta. Sin eso,
 *      dos facturas por la mitad pasan las dos y juntas cobran el doble.
 *   3. La tolerancia de precio es el mayor de 1 peso o 0.5%, y la de cantidad
 *      por encima de lo recibido es cero.
 *   4. Una línea que no está en la orden se denuncia, no se ignora.
 * ============================================================================
 */

const PARTIDAS = [
  /* 10 piezas caras a $1,000 y 100 baratas a $10. Total de la orden: $11,000. */
  { id: 'p-cara', descripcion: 'Bomba', cantidad: 10, cantidadRecibidaOk: 10, precioUnitario: 1000 },
  { id: 'p-barata', descripcion: 'Empaque', cantidad: 100, cantidadRecibidaOk: 100, precioUnitario: 10 },
];

const sinPrevias = () => new Map<string, number>();

describe('el cotejo de tres vías', () => {
  it('caza al proveedor que cuadra el total y mueve los renglones', () => {
    /*
     * Factura: la bomba a $1,100 (+$1,000 en total) y el empaque a $0 (−$1,000).
     * Suma $11,000, exactamente lo pactado. Un control por totales lo aprueba.
     */
    const r = cotejarTresVias({
      partidasDeLaOrden: PARTIDAS,
      lineasDeLaFactura: [
        { detalleOrdenId: 'p-cara', descripcion: 'Bomba', cantidad: 10, precioUnitario: 1100 },
        { detalleOrdenId: 'p-barata', descripcion: 'Empaque', cantidad: 100, precioUnitario: 0 },
      ],
      facturadoPrevio: sinPrevias(),
    });

    const total = r.renglones.reduce(
      (a, x) => a + x.facturado * x.precioFacturado,
      0,
    );
    /* La premisa de la prueba: el total SÍ cuadra. Si esto deja de ser cierto,
     * la prueba ya no estaría midiendo lo que dice medir. */
    expect(total).toBe(11000);

    expect(r.conciliado).toBe(false);
    expect(
      r.renglones
        .filter((x) => x.diferencias.some((d) => d.tipo === 'PRECIO_DISTINTO_AL_PACTADO'))
        .map((x) => x.detalleOrdenId)
        .sort(),
    ).toEqual(['p-barata', 'p-cara']);
  });

  it('una factura fiel a la orden y a lo recibido se concilia', () => {
    const r = cotejarTresVias({
      partidasDeLaOrden: PARTIDAS,
      lineasDeLaFactura: [
        { detalleOrdenId: 'p-cara', descripcion: null, cantidad: 10, precioUnitario: 1000 },
        { detalleOrdenId: 'p-barata', descripcion: null, cantidad: 100, precioUnitario: 10 },
      ],
      facturadoPrevio: sinPrevias(),
    });
    expect(r.conciliado).toBe(true);
    expect(r.renglones.flatMap((x) => x.diferencias)).toEqual([]);
  });

  it('no deja facturar más piezas de las que entraron al almacén', () => {
    const r = cotejarTresVias({
      partidasDeLaOrden: [
        { id: 'p1', descripcion: 'Bomba', cantidad: 10, cantidadRecibidaOk: 4, precioUnitario: 1000 },
      ],
      lineasDeLaFactura: [
        { detalleOrdenId: 'p1', descripcion: 'Bomba', cantidad: 10, precioUnitario: 1000 },
      ],
      facturadoPrevio: sinPrevias(),
    });
    expect(r.conciliado).toBe(false);
    expect(r.renglones[0].diferencias.map((d) => d.tipo)).toEqual([
      'FACTURA_MAS_DE_LO_RECIBIDO',
    ]);
    /* No se denuncia «más de lo ordenado»: se pidieron 10 y facturan 10. Las
     * dos diferencias son distintas y confundirlas haría ilegible el reporte. */
  });

  it('la segunda factura por la mitad ya no pasa: lo previo cuenta', () => {
    /*
     * El proveedor factura 5 de 10 recibidas, y luego otra vez 5. La segunda es
     * legítima. La TERCERA por 5 más ya cobra mercancía que no llegó, y sin
     * `facturadoPrevio` las tres pasarían porque cada una, sola, cabe.
     */
    const partida = [
      { id: 'p1', descripcion: 'Bomba', cantidad: 10, cantidadRecibidaOk: 10, precioUnitario: 1000 },
    ];
    const segunda = cotejarTresVias({
      partidasDeLaOrden: partida,
      lineasDeLaFactura: [
        { detalleOrdenId: 'p1', descripcion: null, cantidad: 5, precioUnitario: 1000 },
      ],
      facturadoPrevio: new Map([['p1', 5]]),
    });
    expect(segunda.conciliado).toBe(true);
    expect(segunda.renglones[0].facturado).toBe(10);

    const tercera = cotejarTresVias({
      partidasDeLaOrden: partida,
      lineasDeLaFactura: [
        { detalleOrdenId: 'p1', descripcion: null, cantidad: 5, precioUnitario: 1000 },
      ],
      facturadoPrevio: new Map([['p1', 10]]),
    });
    expect(tercera.conciliado).toBe(false);
    expect(tercera.renglones[0].diferencias.map((d) => d.tipo).sort()).toEqual([
      'FACTURA_MAS_DE_LO_ORDENADO',
      'FACTURA_MAS_DE_LO_RECIBIDO',
    ]);
    /* Y el detalle dice que parte venía de antes: quien lo lee tiene que poder
     * encontrar la otra factura sin preguntar. */
    expect(tercera.renglones[0].diferencias[0].detalle).toContain('10 ya venían facturadas');
  });

  it('una línea que nadie pidió se denuncia, no se ignora', () => {
    const r = cotejarTresVias({
      partidasDeLaOrden: PARTIDAS,
      lineasDeLaFactura: [
        { detalleOrdenId: null, descripcion: 'Flete', cantidad: 1, precioUnitario: 850 },
      ],
      facturadoPrevio: sinPrevias(),
    });
    expect(r.conciliado).toBe(false);
    expect(r.renglones[0].diferencias[0].tipo).toBe('PARTIDA_QUE_NO_ESTA_EN_LA_ORDEN');
    expect(r.renglones[0].diferencias[0].detalle).toContain('Flete');
  });

  it('una factura vacía no se declara conciliada', () => {
    /*
     * `conciliado = sin diferencias` es cierto y vacuo cuando no hay renglones:
     * cero diferencias de cero partidas. El servicio rechaza la captura sin
     * partidas antes de llegar aquí, y esta prueba fija que ese guardia es el
     * que manda — si alguien lo quita, el resumen delata que no se cotejó nada.
     */
    const r = cotejarTresVias({
      partidasDeLaOrden: PARTIDAS,
      lineasDeLaFactura: [],
      facturadoPrevio: sinPrevias(),
    });
    expect(r.renglones).toEqual([]);
    expect(r.resumen).toContain('0 partida');
  });
});

describe('la tolerancia de precio', () => {
  it('perdona el redondeo del proveedor y no la diferencia de criterio', () => {
    const casos: Array<[number, number, boolean, string]> = [
      /* pactado, facturado, ¿fuera?, por qué */
      [10, 10.5, false, 'medio peso sobre diez: por debajo del peso absoluto'],
      [10, 11.5, true, 'un peso y medio sobre diez: ni el peso ni el 0.5% lo cubren'],
      [1000, 1004, false, 'cuatro pesos sobre mil: dentro del 0.5% ($5)'],
      [1000, 1006, true, 'seis pesos sobre mil: fuera del 0.5%'],
      [0, 0, false, 'un regalo facturado en cero coincide con lo pactado'],
      [100, 100, false, 'lo pactado exacto nunca es una diferencia'],
    ];
    const fallos = casos.filter(([p, f, esperado]) => precioFueraDeTolerancia(p, f) !== esperado);
    expect(fallos).toEqual([]);
  });

  it('es simétrica: facturar de menos también es una diferencia', () => {
    /*
     * Pudo parecer que sólo importa que cobren de más. Pero una factura por
     * debajo de lo pactado suele ser un error de captura, y si se acepta
     * callando, el pago se tope contra un número menor del que el proveedor va
     * a reclamar. La diferencia se mira en los dos sentidos.
     */
    expect(precioFueraDeTolerancia(1000, 900)).toBe(true);
    expect(precioFueraDeTolerancia(900, 1000)).toBe(true);
  });

  it('el peso absoluto es lo que gobierna los precios pequeños', () => {
    /* Sin el mínimo absoluto, el 0.5% de $2 serían $0.01 y cualquier centavo
     * en artículos baratos frenaría el pago. */
    expect(TOLERANCIA_PRECIO_ABSOLUTA).toBe(1);
    expect(precioFueraDeTolerancia(2, 2.9)).toBe(false);
    expect(precioFueraDeTolerancia(2, 3.5)).toBe(true);
  });
});
