import { BadRequestException } from '@nestjs/common';
import { valorRecibidoOC } from '../entities/orden-compra.entity';
import { OrdenesCompraService } from './ordenes-compra.service';

/**
 * ============================================================================
 * LO QUE SE LE DEVOLVIÓ AL PROVEEDOR NO SE LE PAGA
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * El techo de pago de una orden lo pone `valorRecibidoOC`, que mide contra
 * `cantidadRecibidaOk`. Una devolución al proveedor **no toca ese campo**, y no
 * puede tocarlo: es lo que `devolvible()` usa para saber qué queda por devolver,
 * así que bajarlo permitiría devolver dos veces la misma mercancía.
 *
 * Resultado, sin la resta:
 *
 *     OC de 100 piezas a $100 + IVA = $11,600, recibida completa.
 *     Se devuelven 50 por defectuosas. La mercancía sale del almacén, la nota
 *     de crédito del proveedor es de $5,800 y su póliza ya está asentada.
 *     Tesorería entra a pagar: el máximo sigue siendo $11,600.
 *
 * Se pagaban $5,800 de mercancía que ya no está, con la cuenta por pagar y la
 * póliza contradiciéndose, y la orden quedaba marcada como liquidada. Nada
 * falla: el pago se acepta.
 *
 * Y EL MISMO DEFECTO POR EL OTRO LADO
 *
 * `saldoPendiente` se medía contra `oc.total` a secas. Como el proveedor nunca
 * va a cobrar la parte devuelta, una orden con devolución **no llegaba nunca a
 * PAGADA**: se quedaba en PARCIAL con el importe de la nota de crédito
 * pendiente para siempre. Lo encontré al arreglar el primero, y es la razón de
 * que las dos mitades vayan en el mismo parche.
 * ============================================================================
 */

type Fila = Record<string, unknown>;

/** Una orden recibida completa: 100 piezas, $10,000 + $1,600 de IVA. */
function ordenRecibidaCompleta() {
  return {
    id: 'oc1',
    empresaId: 'e1',
    total: 11600,
    totalPagado: 0,
    saldoPendiente: 11600,
    estadoRecepcion: 'COMPLETA',
    estadoPago: 'PENDIENTE',
    proveedorId: 'prov1',
    detalles: [
      { cantidad: 100, cantidadRecibidaOk: 100, subtotal: 10000, impuestoImporte: 1600 },
    ],
  } as Fila;
}

/**
 * Monta el servicio con lo mínimo para ejercitar el techo de pago: la
 * transacción, la consulta de devoluciones y el guardado. Todo lo que viene
 * después del guardia (folios, tesorería, caja, asientos) se corta con un error
 * reconocible, porque lo que se mide aquí es la decisión, no el resto del pago.
 */
function servicioConDevolucionDe(devuelto: number, orden: Fila = ordenRecibidaCompleta()) {
  const guardados: Fila[] = [];
  const CORTE = 'CORTE-DESPUES-DEL-GUARDIA';

  const em = {
    createQueryBuilder: () => ({
      setLock: () => ({
        where: () => ({ getOne: async () => orden }),
      }),
    }),
    find: async () => (orden.detalles as Fila[]) ?? [],
    query: async (sql: string) => {
      if (/devoluciones_proveedor/i.test(sql)) {
        /* numeric de PostgreSQL llega como texto: se devuelve así a propósito. */
        return [{ devuelto: String(devuelto) }];
      }
      if (/detalles_orden_compra/i.test(sql)) return [{ iva: '1600' }];
      if (/pagos_proveedor/i.test(sql)) return [{ iva: '0' }];
      return [];
    },
    /* La cuenta bancaria se comprueba antes del techo de pago: si no existe,
       el camino muere ahí y la prueba mediría otra cosa. */
    findOne: async () => ({ id: 'c1', empresaId: 'e1', activo: true, tipo: 'BANCO' }),
    create: (_e: unknown, v: Fila) => v,
    save: async (v: Fila) => {
      guardados.push(v);
      return v;
    },
    getRepository: () => ({ findOne: async () => null }),
  };

  const servicio = Object.create(OrdenesCompraService.prototype) as OrdenesCompraService;
  Object.assign(servicio, {
    dataSource: {
      transaction: async (cb: (m: unknown) => Promise<unknown>) => cb(em),
      getRepository: () => ({ findOne: async () => null, update: async () => undefined }),
    },
    ordenRepo: { findOne: async () => orden },
    folios: {
      siguiente: async () => {
        throw new Error(CORTE);
      },
    },
    asientos: { encolarEnTransaccion: async () => ({ id: 'a1' }) },
    tesoreria: { registrarEnTransaccion: async () => ({ id: 'm1' }) },
    caja: { registrarEnTransaccion: async () => undefined },
  });
  return { servicio, orden, guardados, CORTE };
}

describe('el valor recibido de una orden', () => {
  it('no sabe nada de devoluciones: por eso hace falta restarlas aparte', () => {
    /*
     * Esta prueba fija el contrato de la función, que es correcto y no se
     * cambió: mide lo recibido y aceptado. Una devolución no es una recepción
     * menor, es un documento aparte — y el techo de pago es la diferencia.
     */
    expect(
      valorRecibidoOC([
        { cantidad: 100, cantidadRecibidaOk: 100, subtotal: 10000, impuestoImporte: 1600 },
      ]),
    ).toBe(11600);
    expect(
      valorRecibidoOC([
        { cantidad: 100, cantidadRecibidaOk: 50, subtotal: 10000, impuestoImporte: 1600 },
      ]),
    ).toBe(5800);
  });
});

describe('el techo de pago con una devolución vigente', () => {
  it('rechaza el pago del total y nombra el máximo correcto', async () => {
    const { servicio } = servicioConDevolucionDe(5800);
    const error = await servicio
      .pagarOrden(
        'oc1',
        'e1',
        {
          montoPagado: 11600,
          cuentaBancariaId: 'c1',
          claveIdempotencia: 'k1',
          fechaPago: '2026-10-06',
        },
        'u1',
      )
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    /* El mensaje tiene que decir el número: «excede el saldo» a secas obliga a
       tesorería a adivinar cuánto puede pagar. */
    expect(String((error as Error).message)).toContain('5800.00');
  });

  it('deja pagar exactamente lo que queda a deber', async () => {
    /*
     * La mitad que importa no romper: el pago legítimo tiene que pasar el
     * guardia. Se reconoce porque la ejecución llega al folio del pago, que es
     * el primer paso después de la decisión.
     */
    const { servicio, CORTE } = servicioConDevolucionDe(5800);
    const error = await servicio
      .pagarOrden(
        'oc1',
        'e1',
        {
          montoPagado: 5800,
          cuentaBancariaId: 'c1',
          claveIdempotencia: 'k2',
          fechaPago: '2026-10-06',
        },
        'u1',
      )
      .catch((e: Error) => e);

    expect((error as Error).message).toBe(CORTE);
  });

  it('sin devoluciones el techo es el valor recibido, como siempre', async () => {
    const { servicio, CORTE } = servicioConDevolucionDe(0);
    const error = await servicio
      .pagarOrden(
        'oc1',
        'e1',
        {
          montoPagado: 11600,
          cuentaBancariaId: 'c1',
          claveIdempotencia: 'k3',
          fechaPago: '2026-10-06',
        },
        'u1',
      )
      .catch((e: Error) => e);
    expect((error as Error).message).toBe(CORTE);
  });

  it('una devolución cancelada no reduce nada', async () => {
    /*
     * La consulta filtra por `estado = 'REGISTRADA'`. Si contara las
     * canceladas, cancelar una devolución dejaría de poder pagarse la orden y
     * el proveedor se quedaría sin cobrar mercancía que sí se quedó.
     *
     * La aserción se hace **fuera** del doble, sobre lo que quedó registrado.
     * La primera versión la puso dentro del `query` del doble, y como la
     * llamada acaba en un `.catch`, el fallo de la aserción se lo tragaba la
     * promesa: quitar el filtro del servicio no rompía nada. Lo descubrió el
     * mutante que lo quitó.
     */
    const { servicio } = servicioConDevolucionDe(0);
    const parametros: unknown[][] = [];
    Object.assign(servicio, {
      dataSource: {
        transaction: async (cb: (m: unknown) => Promise<unknown>) =>
          cb({
            createQueryBuilder: () => ({
              setLock: () => ({ where: () => ({ getOne: async () => ordenRecibidaCompleta() }) }),
            }),
            find: async () => [
              { cantidad: 100, cantidadRecibidaOk: 100, subtotal: 10000, impuestoImporte: 1600 },
            ],
            findOne: async () => ({ id: 'c1', empresaId: 'e1', activo: true, tipo: 'BANCO' }),
            save: async (v: Fila) => v,
            create: (_e: unknown, v: Fila) => v,
            query: async (sql: string, params: unknown[]) => {
              if (/devoluciones_proveedor/i.test(sql)) {
                parametros.push(params);
                return [{ devuelto: '0' }];
              }
              return [{ iva: '0' }];
            },
          }),
        getRepository: () => ({ findOne: async () => null }),
      },
    });

    await servicio
      .pagarOrden(
        'oc1',
        'e1',
        {
          montoPagado: 1,
          cuentaBancariaId: 'c1',
          claveIdempotencia: 'k4',
          fechaPago: '2026-10-06',
        },
        'u1',
      )
      .catch(() => undefined);

    expect(parametros).toHaveLength(1);
    expect(parametros[0]).toContain('REGISTRADA');
  });
});
