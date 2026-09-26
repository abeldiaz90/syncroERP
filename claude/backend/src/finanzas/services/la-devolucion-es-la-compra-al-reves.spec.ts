import { Logger } from '@nestjs/common';
import { MotorContableService } from './motor-contable.service';

/**
 * ============================================================================
 * Una devolución a proveedor es la compra al revés, no una merma
 * ----------------------------------------------------------------------------
 * Este circuito no existía hasta el 26-sep-2026. Lo que había era un mensaje
 * —«Registra la devolución al proveedor», al intentar cancelar una orden ya
 * recibida— que mandaba a un sitio inexistente, y lo único a mano era un
 * ajuste de inventario. Un ajuste dice «había menos de lo que pensábamos» y su
 * contrapartida es una merma; una devolución dice «esto se lo regresamos» y su
 * contrapartida es la cuenta por pagar. Registrar una como la otra deja el
 * gasto donde no va y la deuda con el proveedor intacta.
 *
 * LAS DOS DECISIONES QUE ESTA PRUEBA FIJA
 *
 * 1. NO SE USA LA 503. «Devoluciones, descuentos o bonificaciones sobre
 *    compras» es del sistema PERIÓDICO, donde la compra va a la 502 y el
 *    inventario sólo se ajusta al cierre. Este ERP lleva inventario PERPETUO
 *    —`generarAsientoDeCompra` carga a Inventario—, así que la devolución
 *    tiene que abonar Inventario. Usar la 503 dejaría el almacén inflado y el
 *    costo mal por el mismo importe, y no se notaría hasta el primer conteo
 *    físico.
 *
 * 2. EL IVA SE DEVUELVE DE DONDE ESTÉ. Al comprar se carga a 119 «IVA
 *    pendiente de pago»; al liquidar la factura pasa a 118 «acreditable
 *    pagado». Devolver algo aún no pagado y devolver algo ya pagado no son el
 *    mismo asiento, y acreditarse un IVA que se devolvió es exactamente lo que
 *    una auditoría busca.
 * ============================================================================
 */

const CUENTAS_POR_ROL: Record<string, any> = {
  PROVEEDORES: { id: 'cta-proveedores', numeroCuenta: '201.01' },
  IVA_ACREDITABLE_PENDIENTE: { id: 'cta-iva-119', numeroCuenta: '119.01' },
  IVA_ACREDITABLE_PAGADO: { id: 'cta-iva-118', numeroCuenta: '118.01' },
};

const PRODUCTOS: any[] = [
  {
    id: 'prod-1',
    nombre: 'Guantes de nitrilo',
    categoria: { cuentaInventarioId: 'cta-inventario' },
  },
  {
    id: 'prod-sin-cuenta',
    nombre: 'Producto sin configurar',
    categoria: { nombre: 'Sin cuentas' },
  },
];

interface PolizaGuardada {
  poliza: any;
  partidas: Array<{ cuentaContableId: string; cargo: number; abono: number }>;
}

function crearArnes(sinCuentas: string[] = []) {
  const guardadas: PolizaGuardada[] = [];

  const repoCuentas: any = {
    findOne: jest.fn(async () => null),
    createQueryBuilder: () => {
      const filtros: Record<string, any> = {};
      const qb: any = {
        where: (_: string, p: any) => (Object.assign(filtros, p), qb),
        andWhere: (_: string, p: any) => (Object.assign(filtros, p), qb),
        orderBy: () => qb,
        getOne: async () => {
          if (!filtros.rol) return null;
          if (sinCuentas.includes(filtros.rol)) return null;
          return CUENTAS_POR_ROL[filtros.rol] ?? null;
        },
      };
      return qb;
    },
  };

  const manager: any = {
    create: (_e: any, v: any) => v,
    findOne: jest.fn(async () => null),
    getRepository: () => repoCuentas,
    save: jest.fn(async (entidad: any, valor?: any) => {
      const v = valor ?? entidad;
      if (Array.isArray(v)) {
        guardadas[guardadas.length - 1].partidas = v;
        return v;
      }
      if (v?.concepto) {
        guardadas.push({ poliza: { ...v, id: 'pol-1' }, partidas: [] });
        return { ...v, id: 'pol-1' };
      }
      return v;
    }),
    query: jest.fn(async () => []),
  };

  const dataSource: any = {
    getRepository: () => repoCuentas,
    query: jest.fn(async () => []),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) =>
        String(sql).includes('pg_advisory_xact_lock') ? [{ resultado: 0 }] : [],
      ),
      manager,
    }),
  };

  const productoRepo: any = {
    createQueryBuilder: () => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: async () => PRODUCTOS,
    }),
  };

  const servicio = new MotorContableService(dataSource, productoRepo);
  return { servicio, guardadas };
}

const devolucion = (extra: Partial<any> = {}) => ({
  devolucionId: 'dev-1',
  empresaId: 'e1',
  folio: 'DP-000001',
  fecha: new Date('2026-09-26'),
  ivaYaPagado: false,
  detalles: [
    { productoId: 'prod-1', cantidad: 2, costoUnitario: 350, tasaIva: 0.16 },
  ],
  ...extra,
});

function esperarCuadre(p: PolizaGuardada) {
  const cargos = p.partidas.reduce((s, x) => s + Number(x.cargo), 0);
  const abonos = p.partidas.reduce((s, x) => s + Number(x.abono), 0);
  expect(Math.round(cargos * 100)).toBe(Math.round(abonos * 100));
}

describe('Devolución a proveedor · la compra al revés', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('carga a Proveedores y abona Inventario e IVA', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeDevolucionProveedor(devolucion());

    expect(guardadas).toHaveLength(1);
    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-inventario', abono: 700 }),
        expect.objectContaining({ cuentaContableId: 'cta-iva-119', abono: 112 }),
        expect.objectContaining({ cuentaContableId: 'cta-proveedores', cargo: 812 }),
      ]),
    );
  });

  it('con la orden ya pagada, el IVA sale de acreditable PAGADO', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeDevolucionProveedor(
      devolucion({ ivaYaPagado: true }),
    );

    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-iva-118', abono: 112 }),
      ]),
    );
    expect(
      guardadas[0].partidas.some((p) => p.cuentaContableId === 'cta-iva-119'),
    ).toBe(false);
  });

  it('el costo se abona a Inventario, nunca a una cuenta de devoluciones sobre compras', async () => {
    /*
     * La 503 es del sistema periódico. Aquí abonarla dejaría el inventario
     * inflado y el costo mal por el mismo importe.
     */
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeDevolucionProveedor(devolucion());

    const abonos = guardadas[0].partidas.filter((p) => Number(p.abono) > 0);
    expect(abonos.map((p) => p.cuentaContableId).sort()).toEqual(
      ['cta-inventario', 'cta-iva-119'].sort(),
    );
  });

  it('sin cuenta de inventario en la categoría, no inventa dónde ponerlo', async () => {
    const { servicio } = crearArnes();
    await expect(
      servicio.generarAsientoDeDevolucionProveedor(
        devolucion({
          detalles: [
            { productoId: 'prod-sin-cuenta', cantidad: 1, costoUnitario: 10, tasaIva: 0 },
          ],
        }),
      ),
    ).rejects.toThrow(/falta la cuenta de inventario/i);
  });

  it('sin cuenta de proveedores, no se contabiliza a medias', async () => {
    const { servicio, guardadas } = crearArnes(['PROVEEDORES']);
    await expect(
      servicio.generarAsientoDeDevolucionProveedor(devolucion()),
    ).rejects.toThrow(/cuenta de proveedores/i);
    expect(guardadas).toHaveLength(0);
  });

  it('una devolución sin IVA no arrastra cuentas de impuesto', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeDevolucionProveedor(
      devolucion({
        detalles: [
          { productoId: 'prod-1', cantidad: 1, costoUnitario: 100, tasaIva: 0 },
        ],
      }),
    );

    esperarCuadre(guardadas[0]);
    expect(guardadas[0].partidas).toHaveLength(2);
    expect(guardadas[0].partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-proveedores', cargo: 100 }),
      ]),
    );
  });

  it('la póliza se ancla a la devolución, para que no se duplique', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeDevolucionProveedor(devolucion());

    expect(guardadas[0].poliza.origenTipo).toBe('DEVOLUCION_PROVEEDOR');
    expect(guardadas[0].poliza.origenClave).toBe('DEVOLUCION_PROVEEDOR:dev-1');
  });
});
