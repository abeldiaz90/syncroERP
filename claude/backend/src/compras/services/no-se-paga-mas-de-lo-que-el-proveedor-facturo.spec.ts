import { BadRequestException } from '@nestjs/common';

import { OrdenesCompraService } from './ordenes-compra.service';

/**
 * ============================================================================
 * NO SE PAGA MÁS DE LO QUE EL PROVEEDOR FACTURÓ
 * ----------------------------------------------------------------------------
 * EL HUECO
 *
 * El pago se validaba contra lo RECIBIDO y nada más. Faltaba la otra mitad del
 * control de compras: se paga el MENOR de lo que llegó y lo que el proveedor
 * facturó.
 *
 *     OC de 100 piezas, recibida completa: $11,600 de techo.
 *     El proveedor facturó 50: su CFDI dice $5,800.
 *     Tesorería podía pagar $11,600.
 *
 * Los $5,800 de más se pagaban sin comprobante que los respalde, y la
 * reclasificación de IVA acreditable a la 118 se asentaba igual: $1,600 de IVA
 * acreditado contra CFDIs que suman $800. Eso no lo descubre el ERP, lo
 * descubre el contador cruzando la contabilidad con el visor del SAT, meses
 * después y con el pago ya hecho.
 *
 * LA DECISIÓN QUE ESTAS PRUEBAS FIJAN, Y QUE ES LA MITAD DEL DISEÑO
 *
 * Si la orden NO tiene facturas capturadas, el techo es el de siempre. Un
 * documento nuevo no puede apagar la operación: la instalación que todavía no
 * captura facturas de proveedor queda exactamente como estaba. La última
 * prueba es la que lo vigila, y es la que se rompería si alguien decidiera
 * «ya que estamos, hagamos obligatoria la factura».
 * ============================================================================
 */

type Fila = Record<string, unknown>;

const ORDEN_COMPLETA = () =>
  ({
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
  }) as Fila;

/**
 * El servicio con lo justo para llegar a la decisión del techo. Después del
 * guardia se corta en el folio del pago con un error reconocible: lo que se
 * mide es la decisión, no el resto del pago.
 *
 * `facturas` es `null` cuando la orden no tiene ninguna capturada, y entonces
 * la consulta devuelve cero filas igual que en la base de datos.
 */
function servicioConFacturas(
  facturas: { total: number; iva: number; cuantas: number; conDiferencias?: string[] } | null,
) {
  const CORTE = 'CORTE-DESPUES-DEL-GUARDIA';
  const guardados: Fila[] = [];

  const em = {
    createQueryBuilder: () => ({
      setLock: () => ({ where: () => ({ getOne: async () => ORDEN_COMPLETA() }) }),
    }),
    find: async () => (ORDEN_COMPLETA().detalles as Fila[]),
    findOne: async () => ({ id: 'c1', empresaId: 'e1', activo: true, tipo: 'BANCO' }),
    create: (_e: unknown, v: Fila) => v,
    save: async (v: Fila) => {
      guardados.push(v);
      return v;
    },
    getRepository: () => ({ findOne: async () => null }),
    query: async (sql: string) => {
      if (/facturas_proveedor/i.test(sql)) {
        return facturas
          ? [
              {
                cuantas: facturas.cuantas,
                total: facturas.total,
                iva: facturas.iva,
                conDiferencias: facturas.conDiferencias ?? [],
              },
            ]
          : [{ cuantas: 0, total: 0, iva: 0, conDiferencias: [] }];
      }
      if (/devoluciones_proveedor/i.test(sql)) return [{ devuelto: '0' }];
      if (/detalles_orden_compra/i.test(sql)) return [{ iva: '1600' }];
      if (/pagos_proveedor/i.test(sql)) return [{ iva: '0' }];
      return [];
    },
  };

  const servicio = Object.create(OrdenesCompraService.prototype) as OrdenesCompraService;
  Object.assign(servicio, {
    dataSource: {
      transaction: async (cb: (m: unknown) => Promise<unknown>) => cb(em),
      getRepository: () => ({ findOne: async () => null, update: async () => undefined }),
    },
    folios: {
      siguiente: async () => {
        throw new Error(CORTE);
      },
    },
    asientos: { encolarEnTransaccion: async () => ({ id: 'a1' }) },
    tesoreria: { registrarEnTransaccion: async () => ({ id: 'm1' }) },
    caja: { registrarEnTransaccion: async () => undefined },
  });
  return { servicio, CORTE, guardados };
}

const pagar = (servicio: OrdenesCompraService, monto: number, clave: string) =>
  servicio
    .pagarOrden(
      'oc1',
      'e1',
      {
        montoPagado: monto,
        cuentaBancariaId: 'c1',
        claveIdempotencia: clave,
        fechaPago: '2026-10-11',
      },
      'u1',
    )
    .catch((e: Error) => e);

describe('el techo de pago cuando hay facturas del proveedor', () => {
  it('no deja pagar lo recibido si el proveedor sólo facturó la mitad', async () => {
    const { servicio } = servicioConFacturas({ total: 5800, iva: 800, cuantas: 1 });
    const error = (await pagar(servicio, 11600, 'k1')) as Error;

    expect(error).toBeInstanceOf(BadRequestException);
    /* El mensaje tiene que distinguir cuál de los dos números aprieta: con
     * «excede el saldo» a secas, tesorería no sabe si le falta mercancía o le
     * falta papel, y son dos llamadas distintas a dos personas distintas. */
    expect(error.message).toContain('facturado');
    expect(error.message).toContain('5800.00');
    expect(error.message).toContain('11600.00');
  });

  it('deja pagar exactamente lo facturado', async () => {
    const { servicio, CORTE } = servicioConFacturas({ total: 5800, iva: 800, cuantas: 1 });
    const error = (await pagar(servicio, 5800, 'k2')) as Error;
    expect(error.message).toBe(CORTE);
  });

  it('nombra las facturas con diferencias sin resolver', async () => {
    /*
     * Las diferencias no bloquean el pago por sí mismas —el tope de importe es
     * el control del dinero—, pero quien recibe la negativa tiene que saber que
     * además hay un comprobante que alguien debe revisar. Un dato que existe y
     * no se dice es un dato que no existe.
     */
    const { servicio } = servicioConFacturas({
      total: 5800,
      iva: 800,
      cuantas: 1,
      conDiferencias: ['FP-2026-000007'],
    });
    const error = (await pagar(servicio, 11600, 'k3')) as Error;
    expect(error.message).toContain('FP-2026-000007');
    expect(error.message).toContain('diferencias sin resolver');
  });

  it('si el proveedor facturó más de lo que llegó, el techo sigue siendo lo recibido', async () => {
    /*
     * El menor de los dos, en los dos sentidos. Una factura por la orden
     * completa cuando sólo llegó la mitad no autoriza a pagar la mitad que no
     * está en el almacén.
     */
    const { servicio } = servicioConFacturas({ total: 20000, iva: 2758.62, cuantas: 2 });
    const error = (await pagar(servicio, 20000, 'k4')) as Error;
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('11600.00');
    /* Y la negativa NO culpa a la factura, porque la factura no es el tope. */
    expect(error.message).not.toContain('sólo ha facturado');
  });

  it('el IVA acreditable no pasa del que viene en los comprobantes', async () => {
    /*
     * La orden lleva $1,600 de IVA y las facturas capturadas sólo $800.
     * Acreditar los $1,600 sería acreditar un impuesto que ningún CFDI
     * respalda. El pago liquida el techo, así que la reclasificación es el
     * restante completo: tiene que ser 800, no 1600.
     */
    const { servicio, guardados } = servicioConFacturas({ total: 5800, iva: 800, cuantas: 1 });
    Object.assign(servicio, { folios: { siguiente: async () => 'PP-2026-000001' } });
    await pagar(servicio, 5800, 'k5');

    const pago = guardados.find((g) => g.folio === 'PP-2026-000001');
    expect(pago).toBeDefined();
    expect(Number(pago!.ivaReclasificado)).toBe(800);
  });

  it('sin ninguna factura capturada el pago se comporta exactamente como antes', async () => {
    /*
     * La prueba que vigila la decisión de diseño. Si alguien convierte la
     * factura en requisito, esta se pone roja y dice por qué no debe: una
     * instalación que todavía no captura facturas de proveedor no puede quedar
     * sin poder pagar de un día para otro.
     */
    const { servicio, CORTE } = servicioConFacturas(null);
    const error = (await pagar(servicio, 11600, 'k6')) as Error;
    expect(error.message).toBe(CORTE);
  });
});
