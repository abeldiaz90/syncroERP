import {
  estadoDerivadoPedido,
  loQueFalta,
  tieneBackorder,
} from './lo-que-falta-por-surtir';

/**
 * ============================================================================
 * LO QUE FALTA, LO QUE ESTÁ APARTADO Y LO QUE ESPERA
 * ----------------------------------------------------------------------------
 * Tres números que la pantalla pinta, el servicio guarda y el reporte filtra.
 * Si se calculan en tres sitios acaban diciendo tres cosas, y la más cara es
 * la tercera: un pedido que la pantalla pinta SURTIDO y la base guarda
 * SURTIDO_PARCIAL es un cliente al que nadie vuelve a llamar.
 * ============================================================================
 */

describe('lo que falta de un renglón', () => {
  it('separa lo que está apartado de lo que espera mercancía', () => {
    /* Se pidieron 50, salieron 10, hay 15 apartadas: faltan 40 y de ésas 25
       no tienen mercancía detrás. Ése es el backorder. */
    expect(loQueFalta({ cantidad: 50, cantidadSurtida: 10, cantidadReservada: 15 })).toEqual({
      pendiente: 40,
      reservado: 15,
      enEspera: 25,
    });
  });

  it('no deja que lo apartado exceda lo que falta', () => {
    /*
     * Pasa de verdad: la reserva se consume al surtir, pero si alguien la
     * liberó por fuera —o expiró y se rehizo— el renglón podría decir que
     * tiene apartado más de lo que le falta. Si no se acotara, la pantalla
     * ofrecería surtir mercancía que ya salió.
     */
    expect(loQueFalta({ cantidad: 10, cantidadSurtida: 8, cantidadReservada: 10 })).toEqual({
      pendiente: 2,
      reservado: 2,
      enEspera: 0,
    });
  });

  it('nunca devuelve un pendiente negativo', () => {
    expect(loQueFalta({ cantidad: 5, cantidadSurtida: 7, cantidadReservada: 0 }).pendiente).toBe(0);
  });

  it('sobrevive a los decimales de una mercancía fraccionada', () => {
    /* 0.3 − 0.1 en coma flotante da 0.19999999999999998. Un pedido de kilos
       que nunca se cierra porque le sobran diecisiete diezmilésimas es el
       defecto que esta prueba impide. */
    const r = loQueFalta({ cantidad: 0.3, cantidadSurtida: 0.1, cantidadReservada: 0.2 });
    expect(r.pendiente).toBe(0.2);
    expect(r.enEspera).toBe(0);
  });
});

describe('el estado del pedido se deriva, no se teclea', () => {
  const r = (cantidad: number, surtida: number, reservada = 0) => ({
    cantidad,
    cantidadSurtida: surtida,
    cantidadReservada: reservada,
  });

  it('con todo entregado queda SURTIDO', () => {
    expect(estadoDerivadoPedido([r(10, 10), r(5, 5)], 'CONFIRMADO')).toBe('SURTIDO');
  });

  it('con algo entregado y algo pendiente queda SURTIDO_PARCIAL', () => {
    expect(estadoDerivadoPedido([r(10, 10), r(5, 0, 5)], 'CONFIRMADO')).toBe('SURTIDO_PARCIAL');
  });

  it('sin nada entregado sigue CONFIRMADO aunque esté todo apartado', () => {
    /* Apartar no es entregar. Un pedido con la mercancía reservada y nada
       salido sigue pendiente para el cliente, que es quien pregunta. */
    expect(estadoDerivadoPedido([r(10, 0, 10)], 'CONFIRMADO')).toBe('CONFIRMADO');
  });

  it('un cancelado no revive aunque sus renglones estén completos', () => {
    /*
     * Si el estado se derivara de los renglones a secas, cancelar un pedido ya
     * surtido lo devolvería a SURTIDO en el siguiente guardado, y el motivo de
     * cancelación se quedaría escrito en un pedido que dice estar entregado.
     */
    expect(estadoDerivadoPedido([r(10, 10)], 'CANCELADO')).toBe('CANCELADO');
  });

  it('un borrador no se confirma solo', () => {
    /* Capturar no es comprometer: mientras es borrador no aparta nada, y un
       estado derivado que lo ascendiera comprometería mercancía sin que nadie
       lo haya decidido. */
    expect(estadoDerivadoPedido([r(10, 0)], 'BORRADOR')).toBe('BORRADOR');
  });

  it('cierra con la tolerancia de la coma flotante, no al milímetro', () => {
    expect(estadoDerivadoPedido([r(0.3, 0.1 + 0.2)], 'CONFIRMADO')).toBe('SURTIDO');
  });
});

describe('el backorder', () => {
  it('se reconoce cuando falta algo sin mercancía detrás', () => {
    expect(
      tieneBackorder([
        { cantidad: 10, cantidadSurtida: 0, cantidadReservada: 10 },
        { cantidad: 5, cantidadSurtida: 0, cantidadReservada: 2 },
      ]),
    ).toBe(true);
  });

  it('no existe cuando todo lo que falta está apartado', () => {
    expect(
      tieneBackorder([{ cantidad: 10, cantidadSurtida: 4, cantidadReservada: 6 }]),
    ).toBe(false);
  });
});
