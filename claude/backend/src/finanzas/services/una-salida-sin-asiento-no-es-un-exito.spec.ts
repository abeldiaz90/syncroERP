/**
 * ============================================================================
 * Una salida sin asiento no es un éxito
 * ----------------------------------------------------------------------------
 * `generarAsientoDeSalida` recorre las líneas del movimiento y **se salta en
 * silencio** las que no puede contabilizar: `if (!cat?.cuentaInventarioId)
 * continue;` y `if (!cuentaDebitoId) continue;`. Si se salta todas, `partidas`
 * queda vacío y el método hace `return` sin más.
 *
 * Ese `return` viaja hasta `AsientosPendientesService`, que lo interpreta como
 * lo único que puede interpretar: **el asiento se generó**. Marca el registro
 * GENERADO, lo saca de la bandeja de pendientes, y el diagnóstico de
 * integridad —que cuenta PENDIENTE, REINTENTANDO y FALLIDO— tampoco lo ve.
 *
 * El resultado es una merma o una salida de inventario real, con su costo, que
 * no llegó a ningún libro y de la que ningún control se queja. Es peor que un
 * fallo: un fallo se reintenta.
 *
 * `generarAsientoDeAjusteInventario` ya hacía lo correcto —lanza «el conteo no
 * contiene diferencias con valor contable»—. Esta prueba exige lo mismo de las
 * otras dos puertas, y **nombra el producto**, para que quien lo corrija sepa
 * qué categoría configurar.
 * ============================================================================
 */
import { Logger } from '@nestjs/common';

// El arnés del motor vive en su propio spec; aquí se reconstruye lo mínimo.
import { MotorContableService } from './motor-contable.service';

const PRODUCTOS: any[] = [
  {
    id: 'prod-sin-cuentas',
    sku: 'X-1',
    nombre: 'Artículo sin configurar',
    precioCompra: 10,
    categoria: { nombre: 'Sin configurar' },
  },
  {
    id: 'prod-con-cuentas',
    sku: 'X-2',
    nombre: 'Artículo configurado',
    precioCompra: 100,
    categoria: {
      nombre: 'Configurada',
      cuentaInventarioId: 'cta-inv',
      cuentaCostoVentasId: 'cta-costo',
      cuentaMermasId: 'cta-mermas',
    },
  },
];

function crearMotor() {
  const guardadas: any[] = [];
  const manager: any = {
    save: jest.fn(async (entidad: any, valor: any) => {
      const dato = valor ?? entidad;
      guardadas.push(dato);
      return Array.isArray(dato)
        ? dato.map((d: any, i: number) => ({ ...d, id: `x${i}` }))
        : { ...dato, id: 'x0' };
    }),
    create: jest.fn((_: any, valor: any) => valor),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };
  const dataSource: any = {
    query: jest.fn(async () => []),
    getRepository: jest.fn(() => ({
      createQueryBuilder: () => {
        const qb: any = {
          where: () => qb,
          andWhere: () => qb,
          orderBy: () => qb,
          getOne: async () => ({ id: 'cta-x', numeroCuenta: '100-01' }),
        };
        return qb;
      },
      findOne: async () => null,
    })),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) =>
        sql.includes('pg_advisory_xact_lock') ? [{ resultado: 0 }] : [],
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
  return {
    servicio: new MotorContableService(dataSource, productoRepo),
    guardadas,
  };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('una salida que no pudo contabilizarse no se declara generada', () => {
  it('la merma de un producto sin cuentas falla, y dice cuál', async () => {
    const { servicio, guardadas } = crearMotor();

    await expect(
      servicio.generarAsientoDeSalida({
        movimientoId: 'm-sin',
        tipo: 'MERMA',
        motivo: 'Caducidad',
        fecha: new Date('2026-09-25'),
        empresaId: 'emp-1',
        detalles: [
          { productoId: 'prod-sin-cuentas', cantidad: 3, costoUnitario: 100 },
        ],
      } as any),
    ).rejects.toThrow(/Artículo sin configurar|prod-sin-cuentas/);

    // Y no dejó ninguna póliza a medias.
    expect(guardadas).toEqual([]);
  });

  it('la compra de un producto sin valor tampoco se declara generada', async () => {
    const { servicio } = crearMotor();

    await expect(
      servicio.generarAsientoDeCompra({
        compraId: 'c-sin',
        folio: 'F-1',
        fecha: new Date('2026-09-25'),
        empresaId: 'emp-1',
        detalles: [
          { productoId: 'prod-sin-cuentas', cantidad: 1, costoUnitario: 0 },
        ],
      } as any),
    ).rejects.toThrow();
  });

  it('una merma mitad contabilizable y mitad no, no se contabiliza a medias', async () => {
    /*
     * Es la variante peor: la póliza cuadraría —cada línea aporta su cargo y
     * su abono— pero por un importe menor que el movimiento real. El mayor
     * cuadra, el auxiliar no, y la diferencia no tiene dónde verse.
     */
    const { servicio, guardadas } = crearMotor();

    await expect(
      servicio.generarAsientoDeSalida({
        movimientoId: 'm-mixto',
        tipo: 'MERMA',
        motivo: 'Caducidad',
        fecha: new Date('2026-09-25'),
        empresaId: 'emp-1',
        detalles: [
          { productoId: 'prod-con-cuentas', cantidad: 1, costoUnitario: 100 },
          { productoId: 'prod-sin-cuentas', cantidad: 3, costoUnitario: 100 },
        ],
      } as any),
    ).rejects.toThrow(/Artículo sin configurar/);

    expect(guardadas).toEqual([]);
  });

  it('la carga de inventario inicial no se declara hecha si quedó incompleta', async () => {
    /*
     * Aquí el silencio era doble: las líneas sin cuenta se saltaban y la
     * contrapartida se calculaba con el total PARCIAL, así que la póliza
     * cuadraba con un importe menor que el inventario que se estaba cargando.
     * Y si no se salvaba ninguna línea, el método escribía un `warn` en el log
     * del servidor y devolvía normal: «asiento generado».
     */
    const { servicio, guardadas } = crearMotor();

    await expect(
      servicio.generarAsientoDeInventarioInicial({
        empresaId: 'emp-1',
        fecha: new Date('2026-09-25'),
        detalles: [
          { productoId: 'prod-con-cuentas', cantidad: 2, costoUnitario: 100 },
          { productoId: 'prod-sin-cuentas', cantidad: 5, costoUnitario: 40 },
        ],
      } as any),
    ).rejects.toThrow(/Artículo sin configurar/);

    expect(guardadas).toEqual([]);
  });
});
