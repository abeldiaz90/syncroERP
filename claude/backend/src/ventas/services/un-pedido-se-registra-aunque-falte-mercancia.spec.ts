import { ConflictException } from '@nestjs/common';

import { PedidosVentaService } from './pedidos-venta.service';

/**
 * ============================================================================
 * UN PEDIDO SE REGISTRA AUNQUE FALTE MERCANCÍA
 * ----------------------------------------------------------------------------
 * LA DECISIÓN QUE ESTAS PRUEBAS CUSTODIAN
 *
 * Confirmar un pedido aparta lo que el almacén tenga y **no falla por lo que
 * no tenga**. La alternativa —negarse a confirmar si falta algo— parece más
 * estricta y es peor: el pedido se sigue apuntando en una libreta, y entonces
 * el sistema no se entera ni de los renglones que SÍ podía apartar.
 *
 * Lo que falta no desaparece: queda como *backorder* en el renglón, que es el
 * número por el que el cliente llama y que hasta hoy no existía en ninguna
 * parte del ERP.
 *
 * Y LA OTRA: EL PRECIO PACTADO
 *
 * La venta recalcula precios con la lista vigente. Si la lista cambió entre el
 * pedido y la entrega, lo que se cobraría no es lo que se pactó. Eso no se
 * deja pasar en silencio: se compara ANTES de vender —comprobarlo después
 * sería descubrir el cobro equivocado con el dinero ya en la caja— y la
 * negativa nombra los dos números.
 * ============================================================================
 */

type Fila = Record<string, any>;

function servicio(opciones: {
  pedido: Fila;
  detalles: Fila[];
  stock?: Fila | null;
  precios?: any;
  ventas?: any;
}) {
  const guardados: Fila[] = [];
  const stock = opciones.stock === undefined
    ? { cantidad: 100, reservado: 0, bloqueado: 0 }
    : opciones.stock;

  const em: any = {
    createQueryBuilder: (entidad: any) => ({
      setLock: () => ({
        where: () => ({
          getOne: async () => {
            const nombre = entidad?.name ?? '';
            if (nombre === 'PedidoVenta') return opciones.pedido;
            if (nombre === 'StockPorAlmacen') return stock;
            if (nombre === 'ReservaInventario') return null;
            return null;
          },
          andWhere: () => ({ getOne: async () => null }),
        }),
      }),
    }),
    find: async () => opciones.detalles,
    findOne: async (entidad: any) =>
      (entidad?.name ?? '') === 'PedidoVenta' ? opciones.pedido : { id: 'x', activo: true },
    create: (_e: any, v: Fila) => ({ id: `nuevo-${guardados.length}`, ...v }),
    save: async (a: any, b?: any) => {
      const valor = b ?? a;
      if (Array.isArray(valor)) {
        guardados.push(...valor);
        return valor;
      }
      guardados.push(valor);
      return valor;
    },
  };

  const svc = Object.create(PedidosVentaService.prototype) as PedidosVentaService;
  Object.assign(svc, {
    dataSource: {
      transaction: async (cb: (m: unknown) => Promise<unknown>) => cb(em),
      query: async () => [{ cuantas: 0 }],
    },
    repo: { findOne: async () => opciones.pedido, find: async () => [opciones.pedido] },
    detallesRepo: { find: async () => opciones.detalles },
    folios: { siguiente: async () => 'PV-2026-000001' },
    precios: opciones.precios ?? { resolverVenta: async () => ({ detalles: [] }) },
    ventas: opciones.ventas ?? { crear: async () => ({ detalles: [] }) },
  });
  /* `obtener` toca el repositorio con relaciones; aquí interesa la decisión,
     no la lectura de vuelta, así que se corta con algo reconocible. */
  (svc as any).obtener = async () => ({ detalles: opciones.detalles });
  return { svc, guardados, stock };
}

const renglon = (sobre: Partial<Fila> = {}): Fila => ({
  id: 'd1',
  pedidoId: 'p1',
  productoId: 'prod1',
  cantidad: 50,
  cantidadSurtida: 0,
  cantidadReservada: 0,
  reservaId: null,
  precioUnitario: 100,
  ...sobre,
});

const pedidoBorrador = (): Fila => ({
  id: 'p1',
  empresaId: 'e1',
  folio: 'PV-2026-000001',
  almacenId: 'alm1',
  clienteId: 'c1',
  listaPrecioId: null,
  estado: 'BORRADOR',
});

describe('confirmar un pedido', () => {
  it('aparta lo que hay y deja anotado lo que falta, sin negarse', async () => {
    /* Se piden 50 y en el almacén hay 30 disponibles. */
    const d = renglon();
    const { svc, guardados } = servicio({
      pedido: pedidoBorrador(),
      detalles: [d],
      stock: { cantidad: 30, reservado: 0, bloqueado: 0 },
    });

    await svc.confirmar('p1', 'e1', 'u1');

    expect(d.cantidadReservada).toBe(30);
    /* Y las veinte que faltan quedan como backorder, que es el dato nuevo. */
    expect(Number(d.cantidad) - Number(d.cantidadReservada)).toBe(20);
    expect(guardados.some((g) => g.estado === 'CONFIRMADO')).toBe(true);
  });

  it('no aparta lo que ya está comprometido con otro', async () => {
    /* 100 piezas físicas, 90 reservadas para otros: sólo quedan 10 libres. */
    const d = renglon({ cantidad: 50 });
    const { svc } = servicio({
      pedido: pedidoBorrador(),
      detalles: [d],
      stock: { cantidad: 100, reservado: 90, bloqueado: 0 },
    });
    await svc.confirmar('p1', 'e1', 'u1');
    expect(d.cantidadReservada).toBe(10);
  });

  it('sin existencia ninguna, el pedido se confirma igual y queda todo en espera', async () => {
    /*
     * El caso que define el módulo. Antes esto no se podía registrar en
     * ningún lado: el cliente pedía, el vendedor lo apuntaba en un papel y el
     * almacén se enteraba cuando llamaba a reclamar.
     */
    const d = renglon();
    const { svc, guardados } = servicio({
      pedido: pedidoBorrador(),
      detalles: [d],
      stock: null,
    });
    await svc.confirmar('p1', 'e1', 'u1');
    expect(d.cantidadReservada).toBe(0);
    expect(guardados.some((g) => g.estado === 'CONFIRMADO')).toBe(true);
  });

  it('confirmar dos veces no aparta el doble', async () => {
    /*
     * Un reintento tras un fallo a la mitad, o dos clics, no pueden sacar de
     * disponible dos veces la misma mercancía. El renglón ya sabe cuánto
     * tiene apartado y sólo pide la diferencia.
     */
    const d = renglon({ cantidadReservada: 30, reservaId: null });
    const { svc, stock } = servicio({
      pedido: { ...pedidoBorrador(), estado: 'BORRADOR' },
      detalles: [d],
      stock: { cantidad: 100, reservado: 30, bloqueado: 0 },
    });
    await svc.confirmar('p1', 'e1', 'u1');
    /* Le faltaban 20 por apartar, no 50. */
    expect(d.cantidadReservada).toBe(50);
    expect(Number(stock!.reservado)).toBe(50);
  });

  it('un pedido que ya no es borrador no se vuelve a confirmar', async () => {
    const { svc } = servicio({
      pedido: { ...pedidoBorrador(), estado: 'CONFIRMADO' },
      detalles: [renglon()],
    });
    const error = await svc.confirmar('p1', 'e1', 'u1').catch((e: Error) => e);
    expect(error).toBeInstanceOf(ConflictException);
  });
});

describe('surtir un pedido', () => {
  const pedidoConfirmado = () => ({ ...pedidoBorrador(), estado: 'CONFIRMADO' });

  it('se niega si el precio cambió desde que se pactó, y dice los dos números', async () => {
    const d = renglon({ cantidadReservada: 50, reservaId: 'r1', precioUnitario: 100 });
    const { svc } = servicio({
      pedido: pedidoConfirmado(),
      detalles: [d],
      precios: {
        resolverVenta: async () => ({
          detalles: [{ productoNombre: 'Cemento', precioUnitario: 130 }],
        }),
      },
    });

    const error = (await svc
      .surtir('p1', 'e1', { metodoPago: 'EFECTIVO' }, 'u1')
      .catch((e: Error) => e)) as Error;

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('Cemento');
    expect(error.message).toContain('100.00');
    expect(error.message).toContain('130.00');
  });

  it('con el precio aceptado explícitamente, surte y lo deja escrito en la venta', async () => {
    const d = renglon({ cantidadReservada: 50, reservaId: 'r1', precioUnitario: 100 });
    let dtoDeLaVenta: any = null;
    const { svc } = servicio({
      pedido: pedidoConfirmado(),
      detalles: [d],
      precios: {
        resolverVenta: async () => ({
          detalles: [{ productoNombre: 'Cemento', precioUnitario: 130 }],
        }),
      },
      ventas: {
        crear: async (dto: any) => {
          dtoDeLaVenta = dto;
          return { id: 'v1', detalles: [{ productoId: 'prod1', cantidad: 50 }] };
        },
      },
    });

    await svc.surtir(
      'p1',
      'e1',
      { metodoPago: 'EFECTIVO', aceptarPrecioVigente: true },
      'u1',
    );

    expect(dtoDeLaVenta).not.toBeNull();
    /* Que alguien aceptó el precio de hoy tiene que quedar en el documento,
       no sólo en la conciencia de quien pulsó el botón. */
    expect(String(dtoDeLaVenta.notas)).toContain('precio vigente');
    expect(d.cantidadSurtida).toBe(50);
  });

  it('escribe lo surtido desde lo que la venta de verdad sacó, no desde lo pedido', async () => {
    /*
     * Si la venta entrega menos —el almacén no tenía todo, un lote no
     * alcanzó—, el renglón NO puede quedar marcado como completo. Ése es
     * exactamente el cliente al que nadie vuelve a llamar: el pedido dice
     * entregado y faltan diez piezas.
     */
    const d = renglon({ cantidadReservada: 50, reservaId: 'r1' });
    const { svc } = servicio({
      pedido: pedidoConfirmado(),
      detalles: [d],
      precios: {
        resolverVenta: async () => ({
          detalles: [{ productoNombre: 'Cemento', precioUnitario: 100 }],
        }),
      },
      ventas: {
        crear: async () => ({ id: 'v1', detalles: [{ productoId: 'prod1', cantidad: 40 }] }),
      },
    });

    await svc.surtir('p1', 'e1', { metodoPago: 'EFECTIVO' }, 'u1');

    expect(d.cantidadSurtida).toBe(40);
    expect(d.cantidadReservada).toBe(10);
  });

  it('no deja surtir más de lo apartado y explica qué espera mercancía', async () => {
    const d = renglon({ cantidad: 50, cantidadReservada: 30, reservaId: 'r1' });
    const { svc } = servicio({ pedido: pedidoConfirmado(), detalles: [d] });

    const error = (await svc
      .surtir(
        'p1',
        'e1',
        { metodoPago: 'EFECTIVO', lineas: [{ detalleId: 'd1', cantidad: 50 }] },
        'u1',
      )
      .catch((e: Error) => e)) as Error;

    expect(error.message).toContain('30');
    expect(error.message).toContain('en espera');
  });

  it('un borrador no se surte', async () => {
    const { svc } = servicio({ pedido: pedidoBorrador(), detalles: [renglon()] });
    const error = await svc
      .surtir('p1', 'e1', { metodoPago: 'EFECTIVO' }, 'u1')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(ConflictException);
  });
});

describe('cancelar un pedido', () => {
  it('suelta lo apartado y devuelve el disponible', async () => {
    const d = renglon({ cantidadReservada: 30, reservaId: null });
    const { svc, stock } = servicio({
      pedido: { ...pedidoBorrador(), estado: 'CONFIRMADO' },
      detalles: [d],
      stock: { cantidad: 100, reservado: 30, bloqueado: 0 },
    });

    await svc.cancelar('p1', 'e1', 'El cliente ya no lo quiere');

    expect(d.cantidadReservada).toBe(0);
    expect(Number(stock!.reservado)).toBe(0);
  });

  it('no cancela un pedido ya surtido: eso es una devolución', async () => {
    /* Cancelar no deshace una venta. Pretenderlo dejaría el inventario y la
       contabilidad diciendo cosas distintas. */
    const { svc } = servicio({
      pedido: { ...pedidoBorrador(), estado: 'SURTIDO' },
      detalles: [renglon({ cantidadSurtida: 50 })],
    });
    const error = (await svc
      .cancelar('p1', 'e1', 'ya no lo quiere')
      .catch((e: Error) => e)) as Error;
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('devolución');
  });

  it('exige un motivo con cuerpo', async () => {
    const { svc } = servicio({
      pedido: { ...pedidoBorrador(), estado: 'CONFIRMADO' },
      detalles: [renglon()],
    });
    const error = (await svc.cancelar('p1', 'e1', 'no').catch((e: Error) => e)) as Error;
    expect(error.message).toContain('seis meses');
  });
});
