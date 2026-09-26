import { Logger } from '@nestjs/common';
import { MotorContableService } from './motor-contable.service';
import { TipoPoliza } from '../entities/poliza.entity';

/**
 * Tests del MOTOR CONTABLE — el corazón del ERP.
 *
 * Invariante sagrado que verifica CADA test:
 *   Σ cargos === Σ abonos en toda póliza generada (partida doble).
 *
 * Los repositorios y el DataSource se simulan por completo: los tests
 * no tocan SQL Server y corren en milisegundos.
 *
 * Cómo correrlos en el proyecto:  npm test -- motor-contable
 */

// ═══════════════════ ARNÉS DE PRUEBA ═══════════════════

/** Catálogo simulado de cuentas contables que buscarCuentaGlobal resolverá. */
const CUENTAS: Record<string, { id: string; numeroCuenta: string } | null> = {
  // clave: `${tipo}|${prefijo}`
  'ACTIVO|1': { id: 'cta-caja', numeroCuenta: '110-01' },
  'PASIVO|208': { id: 'cta-iva-tras', numeroCuenta: '208-01' },
  'PASIVO|207': { id: 'cta-iva-pend', numeroCuenta: '207-01' },
  'PASIVO|21': { id: 'cta-proveed', numeroCuenta: '210-01' },
  'ACTIVO|116': { id: 'cta-iva-acred', numeroCuenta: '116-01' },
  'ACTIVO|117': { id: 'cta-iva-acred-pend', numeroCuenta: '117-01' },
  'ACTIVO|14': { id: 'cta-cxc', numeroCuenta: '140-01' },
  'INGRESO|402': { id: 'cta-intereses', numeroCuenta: '402-01' },
  'CAPITAL|399': { id: 'cta-puente', numeroCuenta: '399-01' },
};

const CUENTAS_POR_ROL: Record<
  string,
  { id: string; numeroCuenta: string } | null
> = {
  CAJA: { id: 'cta-caja', numeroCuenta: '110-01' },
  CLIENTES_CXC: { id: 'cta-cxc', numeroCuenta: '140-01' },
  IVA_TRASLADADO_COBRADO: {
    id: 'cta-iva-tras',
    numeroCuenta: '208-01',
  },
  IVA_TRASLADADO_NO_COBRADO: {
    id: 'cta-iva-pend',
    numeroCuenta: '207-01',
  },
  IVA_ACREDITABLE_PAGADO: {
    id: 'cta-iva-acred',
    numeroCuenta: '116-01',
  },
  IVA_ACREDITABLE_PENDIENTE: {
    id: 'cta-iva-acred-pend',
    numeroCuenta: '117-01',
  },
  PROVEEDORES: { id: 'cta-proveed', numeroCuenta: '210-01' },
  INTERESES: { id: 'cta-intereses', numeroCuenta: '402-01' },
  SALDOS_INICIALES: { id: 'cta-puente', numeroCuenta: '399-01' },
  INGRESOS_HOSPEDAJE: { id: 'cta-hospedaje', numeroCuenta: '401-10' },
  VENTAS: { id: 'cta-ventas', numeroCuenta: '401-01' },
  IMPUESTO_HOSPEDAJE_POR_PAGAR: {
    id: 'cta-ish',
    numeroCuenta: '213-01',
  },
};

const CLAVE_POR_ROL: Record<string, string> = {
  CAJA: 'ACTIVO|1',
  CLIENTES_CXC: 'ACTIVO|14',
  IVA_TRASLADADO_COBRADO: 'PASIVO|208',
  IVA_TRASLADADO_NO_COBRADO: 'PASIVO|207',
  IVA_ACREDITABLE_PAGADO: 'ACTIVO|116',
  IVA_ACREDITABLE_PENDIENTE: 'ACTIVO|117',
  PROVEEDORES: 'PASIVO|21',
  INTERESES: 'INGRESO|402',
  SALDOS_INICIALES: 'CAPITAL|399',
  INGRESOS_HOSPEDAJE: 'INGRESO|401',
  VENTAS: 'INGRESO|4',
  IMPUESTO_HOSPEDAJE_POR_PAGAR: 'PASIVO|213',
};

/** Productos simulados con su categoría y cuentas. */
const PRODUCTOS: any[] = [
  {
    id: 'prod-1',
    sku: 'FER-0001',
    precioCompra: 100,
    categoria: {
      nombre: 'Herramientas',
      cuentaVentasId: 'cta-ventas',
      cuentaCostoVentasId: 'cta-costo',
      cuentaInventarioId: 'cta-inv',
      cuentaMermasId: 'cta-mermas',
    },
  },
  {
    id: 'prod-2',
    sku: 'FER-0002',
    precioCompra: 50,
    categoria: {
      nombre: 'Tornillería',
      cuentaVentasId: 'cta-ventas-2',
      cuentaCostoVentasId: 'cta-costo',
      cuentaInventarioId: 'cta-inv-2',
      cuentaMermasId: null, // ← sin cuenta de mermas
    },
  },
  {
    id: 'prod-sin-cuentas',
    sku: 'X-1',
    precioCompra: 10,
    categoria: { nombre: 'Sin configurar' }, // ← categoría sin cuentas
  },
  /*
   * Los dos que destaparon el defecto: viven en la MISMA categoría que el
   * refresco gravado —la cuenta de ventas de la categoría es la 401.01— y su
   * impuesto dice otra cosa.
   */
  {
    id: 'prod-tasa-cero',
    sku: 'LECHE-1',
    nombre: 'Leche entera 1 L',
    precioCompra: 20,
    impuesto: { tipoFactor: 'TASA', porcentaje: 0 },
    categoria: {
      nombre: 'Abarrotes',
      cuentaVentasId: 'cta-ventas',
      cuentaCostoVentasId: 'cta-costo',
      cuentaInventarioId: 'cta-inv',
      cuentaMermasId: 'cta-mermas',
    },
  },
  {
    id: 'prod-exento',
    sku: 'LIBRO-1',
    nombre: 'Libro',
    precioCompra: 30,
    impuesto: { tipoFactor: 'EXENTO', porcentaje: 0 },
    categoria: {
      nombre: 'Abarrotes',
      cuentaVentasId: 'cta-ventas',
      cuentaCostoVentasId: 'cta-costo',
      cuentaInventarioId: 'cta-inv',
      cuentaMermasId: 'cta-mermas',
    },
  },
];

/*
 * Las cuentas tal y como las ve `cuentaDeIngresoSegunImpuesto`: por id —la que
 * trae la categoría— y por `codigoAgrupadorSAT` —la que pide el impuesto—.
 */
const CUENTAS_POR_ID: Record<string, any> = {
  'cta-ventas': {
    id: 'cta-ventas',
    numeroCuenta: '401.01',
    codigoAgrupadorSAT: '401.01',
    esAfectable: true,
    activo: true,
  },
  'cta-ventas-2': {
    id: 'cta-ventas-2',
    numeroCuenta: '401.01',
    codigoAgrupadorSAT: '401.01',
    esAfectable: true,
    activo: true,
  },
  'cta-ventas-cero': {
    id: 'cta-ventas-cero',
    numeroCuenta: '401.04',
    codigoAgrupadorSAT: '401.04',
    esAfectable: true,
    activo: true,
  },
  'cta-ventas-exento': {
    id: 'cta-ventas-exento',
    numeroCuenta: '401.07',
    codigoAgrupadorSAT: '401.07',
    esAfectable: true,
    activo: true,
  },
};
const CUENTAS_POR_AGRUPADOR: Record<string, any> = {
  '401.01': CUENTAS_POR_ID['cta-ventas'],
  '401.04': CUENTAS_POR_ID['cta-ventas-cero'],
  '401.07': CUENTAS_POR_ID['cta-ventas-exento'],
};

interface PolizaGuardada {
  poliza: any;
  partidas: Array<{ cuentaContableId: string; cargo: number; abono: number }>;
}

function crearArnes(opts?: {
  periodoCerrado?: boolean;
  sinCuentas?: string[];
}) {
  const guardadas: PolizaGuardada[] = [];
  let pendiente: any = null;

  const manager = {
    create: (_ent: any, obj: any) => obj,
    findOne: jest.fn(async () => null),
    save: jest.fn(async (entOrObj: any, maybeArr?: any) => {
      if (Array.isArray(maybeArr)) {
        // save(PartidaPoliza, partidas[])
        guardadas.push({ poliza: pendiente, partidas: maybeArr });
        return maybeArr;
      }
      // save(poliza)
      pendiente = { ...entOrObj, id: `pol-${guardadas.length + 1}` };
      return pendiente;
    }),
  };

  const dataSource: any = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('cierres_contables')) {
        return opts?.periodoCerrado ? [{ id: 'cierre-1' }] : [];
      }
      // `SELECT TOP 1` era de SQL Server; hoy es `ORDER BY folio DESC LIMIT 1`.
      // Con el nombre viejo, esta rama no se tomaba y el simulador devolvía []
      // por la rama final — funcionaba por casualidad, no por acierto.
      if (sql.includes('folio FROM polizas') || sql.includes('SELECT TOP 1 folio')) {
        return []; // primer folio del año
      }
      if (sql.includes('cuentas_bancarias')) return [];
      if (sql.includes('polizas WHERE concepto')) return []; // anti-duplicado pago
      return [];
    }),
    getRepository: jest.fn(() => ({
      createQueryBuilder: () => {
        const filtros: Record<string, any> = {};
        const qb: any = {
          where: (_: string, p: any) => {
            Object.assign(filtros, p);
            return qb;
          },
          andWhere: (_: string, p: any) => {
            Object.assign(filtros, p);
            return qb;
          },
          orderBy: () => qb,
          getOne: async () => {
            if (filtros.rol) {
              if (opts?.sinCuentas?.includes(CLAVE_POR_ROL[filtros.rol] ?? ''))
                return null;
              return CUENTAS_POR_ROL[filtros.rol] ?? null;
            }
            const clave = `${filtros.t}|${(filtros.d ?? '').replace('%', '')}`;
            if (opts?.sinCuentas?.includes(clave)) return null;
            return CUENTAS[clave] ?? null;
          },
        };
        return qb;
      },
      findOne: async (opciones?: any) => {
        const where = opciones?.where ?? {};
        if (where.id) return CUENTAS_POR_ID[where.id] ?? null;
        if (where.codigoAgrupadorSAT) {
          if (opts?.sinCuentas?.includes(`SAT|${where.codigoAgrupadorSAT}`)) {
            return null;
          }
          return CUENTAS_POR_AGRUPADOR[where.codigoAgrupadorSAT] ?? null;
        }
        return null;
      },
    })),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        /*
         * El candado de folio pasó de `sp_getapplock` (SQL Server) a
         * `pg_advisory_xact_lock`. El simulador se quedó con el nombre viejo,
         * así que el candado real devolvía `undefined`, el motor lo leía como
         * -999 y **las doce pruebas del motor contable fallaban** con «no fue
         * posible reservar el folio» — incluida la que comprueba que un período
         * cerrado rechace el asiento, que pasaba por el motivo equivocado.
         */
        if (sql.includes('pg_advisory_xact_lock') || sql.includes('sp_getapplock')) {
          return [{ resultado: 0 }];
        }
        return dataSource.query(sql);
      }),
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
  return { servicio, guardadas, dataSource };
}

/** El invariante de la partida doble. */
function esperarCuadre(p: PolizaGuardada) {
  const cargos = p.partidas.reduce((s, x) => s + Number(x.cargo), 0);
  const abonos = p.partidas.reduce((s, x) => s + Number(x.abono), 0);
  expect(Math.round(cargos * 100)).toBe(Math.round(abonos * 100));
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

// ═══════════════════ VENTA ═══════════════════

describe('generarAsientoDeVenta', () => {
  const venta = (extra: Partial<any> = {}) => ({
    ventaId: 'v1',
    folio: 101,
    fecha: new Date('2026-07-15'),
    empresaId: 'emp-1',
    totalGeneral: 232,
    detalles: [
      { productoId: 'prod-1', cantidad: 2, subtotal: 200, impuestoMonto: 32 },
    ],
    ...extra,
  });

  it('venta de CONTADO genera 2 pólizas cuadradas: costo (DIARIO) e ingreso (INGRESO)', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeVenta(venta({ metodoPago: 'EFECTIVO' }));

    expect(guardadas).toHaveLength(2);
    guardadas.forEach(esperarCuadre);

    const [costo, ingreso] = guardadas;
    expect(costo.poliza.tipo).toBe(TipoPoliza.DIARIO);
    expect(ingreso.poliza.tipo).toBe(TipoPoliza.INGRESO);

    // Costo: Dr costo / Cr inventario por precioCompra × cantidad = 200
    expect(costo.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-costo', cargo: 200 }),
        expect.objectContaining({ cuentaContableId: 'cta-inv', abono: 200 }),
      ]),
    );

    // Ingreso: Dr caja 232 / Cr ventas 200 / Cr IVA 32
    expect(ingreso.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-caja', cargo: 232 }),
        expect.objectContaining({ cuentaContableId: 'cta-ventas', abono: 200 }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-tras',
          abono: 32,
        }),
      ]),
    );
  });

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * La cuenta de ingresos la decide el impuesto del producto
   * --------------------------------------------------------------------------
   * Medido el 26-sep-2026 contra la instalación: se vendió un producto a tasa
   * 0 % y uno exento, y los dos se abonaron a «401.01 Ventas y/o servicios
   * gravados a la tasa general», porque la cuenta salía de la CATEGORÍA y la
   * categoría no sabe de impuestos. La póliza cuadraba, el balance cuadraba, y
   * la balanza y la declaración de IVA enseñaban base gravada donde no la hay.
   *
   * Es el mismo error de fondo que el CFDI: tres cosas distintas —gravado,
   * tasa 0 % y exento— tratadas como una sola.
   * ══════════════════════════════════════════════════════════════════════════
   */
  it('un producto a TASA 0 % se abona a 401.04, no a ventas gravadas', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeVenta(
      venta({
        metodoPago: 'EFECTIVO',
        totalGeneral: 200,
        detalles: [
          { productoId: 'prod-tasa-cero', cantidad: 2, subtotal: 200, impuestoMonto: 0 },
        ],
      }),
    );
    const ingreso = guardadas.find((g) => g.poliza.tipo === TipoPoliza.INGRESO)!;
    esperarCuadre(ingreso);
    expect(ingreso.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-ventas-cero', abono: 200 }),
      ]),
    );
    expect(
      ingreso.partidas.some((p: any) => p.cuentaContableId === 'cta-ventas'),
    ).toBe(false);
  });

  it('un producto EXENTO se abona a 401.07, no a ventas gravadas', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeVenta(
      venta({
        metodoPago: 'EFECTIVO',
        totalGeneral: 300,
        detalles: [
          { productoId: 'prod-exento', cantidad: 1, subtotal: 300, impuestoMonto: 0 },
        ],
      }),
    );
    const ingreso = guardadas.find((g) => g.poliza.tipo === TipoPoliza.INGRESO)!;
    esperarCuadre(ingreso);
    expect(ingreso.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-ventas-exento', abono: 300 }),
      ]),
    );
  });

  it('un producto GRAVADO se queda en la cuenta de su categoría', async () => {
    // Que el arreglo no mueva de sitio lo que ya estaba bien.
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeVenta(venta({ metodoPago: 'EFECTIVO' }));
    const ingreso = guardadas.find((g) => g.poliza.tipo === TipoPoliza.INGRESO)!;
    expect(ingreso.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-ventas', abono: 200 }),
      ]),
    );
  });

  it('si el catálogo de la empresa no tiene la 401.04, la venta no se detiene', async () => {
    /*
     * Un mostrador parado es peor que una cuenta imperfecta: se abona donde
     * decía la categoría y el diagnóstico de integridad
     * —INGRESO_NO_CONCUERDA_CON_EL_IMPUESTO— lo sigue denunciando.
     */
    const { servicio, guardadas } = crearArnes({ sinCuentas: ['SAT|401.04'] });
    await servicio.generarAsientoDeVenta(
      venta({
        metodoPago: 'EFECTIVO',
        totalGeneral: 200,
        detalles: [
          { productoId: 'prod-tasa-cero', cantidad: 2, subtotal: 200, impuestoMonto: 0 },
        ],
      }),
    );
    const ingreso = guardadas.find((g) => g.poliza.tipo === TipoPoliza.INGRESO)!;
    esperarCuadre(ingreso);
    expect(ingreso.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-ventas', abono: 200 }),
      ]),
    );
  });

  it('venta a CRÉDITO carga a Clientes CxC en lugar de caja', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeVenta(venta({ metodoPago: 'CREDITO_30D' }));

    const ingreso = guardadas.find((g) => g.poliza.tipo === TipoPoliza.INGRESO);
    expect(ingreso.partidas[0]).toEqual(
      expect.objectContaining({ cuentaContableId: 'cta-cxc', cargo: 232 }),
    );
    expect(ingreso.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cuentaContableId: 'cta-iva-pend',
          abono: 32,
        }),
      ]),
    );
    esperarCuadre(ingreso);
  });

  it('productos sin cuentas dejan el asiento pendiente en vez de omitir importes', async () => {
    const { servicio } = crearArnes();
    await expect(
      servicio.generarAsientoDeVenta(
        venta({
          detalles: [
            {
              productoId: 'prod-sin-cuentas',
              cantidad: 5,
              subtotal: 999,
              impuestoMonto: 0,
            },
          ],
        }),
      ),
    ).rejects.toThrow('faltan las cuentas');
  });

  it('con centavos (redondeo) la póliza sigue cuadrando al centavo', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeVenta(
      venta({
        detalles: [
          {
            productoId: 'prod-1',
            cantidad: 1,
            subtotal: 33.335,
            impuestoMonto: 5.333,
          },
          {
            productoId: 'prod-2',
            cantidad: 1,
            subtotal: 66.665,
            impuestoMonto: 10.667,
          },
        ],
        totalGeneral: 116,
      }),
    );
    guardadas.forEach(esperarCuadre);
  });

  it('una salida física con costo cero falla de forma visible', async () => {
    const { servicio, guardadas } = crearArnes();
    await expect(
      servicio.generarAsientoDeVenta(
        venta({
          detalles: [
            {
              productoId: 'prod-1',
              cantidad: 2,
              subtotal: 200,
              impuestoMonto: 32,
              costoTotal: 0,
            },
          ],
        }),
      ),
    ).rejects.toThrow('costo cero');
    expect(guardadas).toHaveLength(0);
  });

  it('si el período está CERRADO rechaza el asiento para que la cola lo reporte', async () => {
    const { servicio, guardadas } = crearArnes({ periodoCerrado: true });
    await expect(
      servicio.generarAsientoDeVenta(venta({ metodoPago: 'EFECTIVO' })),
    ).rejects.toThrow('está cerrado');
    expect(guardadas).toHaveLength(0);
  });
});

// ═══════════════════ COMPRA ═══════════════════

describe('generarAsientoDeCompra', () => {
  const compra = () => ({
    compraId: 'c1',
    folio: 'OC-001',
    fecha: new Date('2026-07-15'),
    empresaId: 'emp-1',
    totalGeneral: 1160,
    detalles: [
      {
        productoId: 'prod-1',
        cantidad: 10,
        costoUnitario: 100,
        tasaIva: 0.16,
      },
    ],
  });

  it('genera EGRESO cuadrado: Dr inventario + Dr IVA acreditable / Cr proveedores', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeCompra(compra());

    expect(guardadas).toHaveLength(1);
    const p = guardadas[0];
    esperarCuadre(p);
    expect(p.poliza.tipo).toBe(TipoPoliza.EGRESO);
    expect(p.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-inv', cargo: 1000 }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-acred-pend',
          cargo: 160,
        }),
        expect.objectContaining({
          cuentaContableId: 'cta-proveed',
          abono: 1160,
        }),
      ]),
    );
  });

  it('sin cuenta de Proveedores configurada: rechaza para no perder el asiento', async () => {
    const { servicio, guardadas } = crearArnes({ sinCuentas: ['PASIVO|21'] });
    await expect(servicio.generarAsientoDeCompra(compra())).rejects.toThrow(
      'falta la cuenta de proveedores',
    );
    expect(guardadas).toHaveLength(0);
  });
});

// ═══════════════════ SALIDA / MERMA ═══════════════════

describe('generarAsientoDeSalida', () => {
  it('MERMA usa la cuenta de mermas de la categoría', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeSalida({
      movimientoId: 'm1',
      tipo: 'MERMA',
      motivo: 'Caducidad',
      fecha: new Date('2026-07-15'),
      empresaId: 'emp-1',
      detalles: [{ productoId: 'prod-1', cantidad: 3, costoUnitario: 100 }],
    });
    const p = guardadas[0];
    esperarCuadre(p);
    expect(p.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-mermas', cargo: 300 }),
        expect.objectContaining({ cuentaContableId: 'cta-inv', abono: 300 }),
      ]),
    );
  });

  it('MERMA sin cuenta de mermas cae a costo de ventas (fallback)', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeSalida({
      movimientoId: 'm2',
      tipo: 'MERMA',
      motivo: 'Rotura',
      fecha: new Date('2026-07-15'),
      empresaId: 'emp-1',
      detalles: [{ productoId: 'prod-2', cantidad: 2, costoUnitario: 50 }], // sin cuentaMermasId
    });
    const p = guardadas[0];
    esperarCuadre(p);
    expect(p.partidas[0]).toEqual(
      expect.objectContaining({ cuentaContableId: 'cta-costo', cargo: 100 }),
    );
  });
});

// ═══════════════════ COBRANZA ═══════════════════

describe('generarAsientoDeCobranza', () => {
  it('cobro con interés reclasifica IVA no cobrado a cobrado', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeCobranza({
      pagoId: 'p1',
      creditoId: 'credito-12345678',
      clienteId: 'cli-1',
      fechaPago: new Date('2026-07-15'),
      empresaId: 'emp-1',
      montoCapital: 900,
      montoInteres: 100,
      totalPagado: 1000,
      ivaReclasificado: 124.14,
    });
    const p = guardadas[0];
    esperarCuadre(p);
    expect(p.poliza.tipo).toBe(TipoPoliza.INGRESO);
    expect(p.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-caja', cargo: 1000 }),
        expect.objectContaining({ cuentaContableId: 'cta-cxc', abono: 900 }),
        expect.objectContaining({
          cuentaContableId: 'cta-intereses',
          abono: 100,
        }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-pend',
          cargo: 124.14,
        }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-tras',
          abono: 124.14,
        }),
      ]),
    );
  });

  it('cobro DESCUADRADO (total ≠ capital + interés) NO se guarda — el candado de crearPoliza actúa', async () => {
    const { servicio, guardadas } = crearArnes();
    await expect(
      servicio.generarAsientoDeCobranza({
        pagoId: 'p2',
        creditoId: 'credito-9',
        clienteId: 'cli-1',
        fechaPago: new Date('2026-07-15'),
        empresaId: 'emp-1',
        montoCapital: 900,
        montoInteres: 100,
        totalPagado: 950, // ← no cuadra
      }),
    ).rejects.toThrow('Póliza descuadrada');
    expect(guardadas).toHaveLength(0);
  });
});

describe('generarAsientoDeHospedaje', () => {
  it.each(['CREDITO_EMPRESA', 'CREDITO_AGENCIA'])(
    '%s carga Clientes CxC e IVA no cobrado, nunca Caja',
    async (metodoPago) => {
      const { servicio, guardadas } = crearArnes();
      await servicio.generarAsientoDeHospedaje({
        documentoId: 'folio-12345678',
        empresaId: 'emp-1',
        folio: 'RES-00000001',
        fecha: new Date('2026-07-15'),
        subtotal: 1_000,
        subtotalHospedaje: 1_000,
        subtotalConsumos: 0,
        iva: 160,
        impuestoHospedaje: 50,
        total: 1_210,
        pagos: [{ metodoPago, importe: 1_210 }],
      });

      expect(guardadas).toHaveLength(1);
      const poliza = guardadas[0];
      esperarCuadre(poliza);
      expect(poliza.partidas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cuentaContableId: 'cta-cxc',
            cargo: 1_210,
          }),
          expect.objectContaining({
            cuentaContableId: 'cta-iva-pend',
            abono: 160,
          }),
          expect.objectContaining({ cuentaContableId: 'cta-ish', abono: 50 }),
        ]),
      );
      expect(poliza.partidas).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cuentaContableId: 'cta-caja',
            cargo: 1_210,
          }),
        ]),
      );
    },
  );
});

// ═══════════════════ PAGO A PROVEEDOR ═══════════════════

describe('generarAsientoDePagoProveedor', () => {
  it('genera EGRESO y reclasifica IVA pendiente a pagado', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDePagoProveedor({
      ocId: 'oc1',
      folio: 'OC-77',
      fecha: new Date('2026-07-15'),
      empresaId: 'emp-1',
      montoPagado: 5000,
      ivaReclasificado: 689.66,
    });
    const p = guardadas[0];
    esperarCuadre(p);
    expect(p.poliza.tipo).toBe(TipoPoliza.EGRESO);
    expect(p.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cuentaContableId: 'cta-proveed',
          cargo: 5000,
        }),
        expect.objectContaining({ cuentaContableId: 'cta-caja', abono: 5000 }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-acred',
          cargo: 689.66,
        }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-acred-pend',
          abono: 689.66,
        }),
      ]),
    );
  });
});

// ═══════════════════ INVENTARIO INICIAL (SAP 561) ═══════════════════

describe('generarAsientoDeInventarioInicial', () => {
  it('agrupa por cuenta de inventario de cada categoría y abona el total a la 399', async () => {
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeInventarioInicial({
      empresaId: 'emp-1',
      fecha: new Date('2026-07-15'),
      detalles: [
        { productoId: 'prod-1', cantidad: 10, costoUnitario: 100 }, // cta-inv   → 1000
        { productoId: 'prod-2', cantidad: 20, costoUnitario: 50 }, // cta-inv-2 → 1000
      ],
    });
    const p = guardadas[0];
    esperarCuadre(p);
    expect(p.poliza.tipo).toBe(TipoPoliza.DIARIO);
    expect(p.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuentaContableId: 'cta-inv', cargo: 1000 }),
        expect.objectContaining({ cuentaContableId: 'cta-inv-2', cargo: 1000 }),
        expect.objectContaining({
          cuentaContableId: 'cta-puente',
          abono: 2000,
        }),
      ]),
    );
  });

  /*
   * Esta prueba exigía lo contrario —«omite el asiento sin lanzar»— y con ello
   * fijaba el defecto en su sitio. Omitir sin lanzar parece prudente y no lo
   * es: el retorno normal llega a `AsientosPendientesService` como «el asiento
   * se generó», el registro se marca GENERADO y sale de la bandeja. La carga
   * entera de inventario inicial quedaba sin contabilizar, con un `warn` en el
   * log del servidor como único rastro y ningún control capaz de notarlo.
   *
   * Lo correcto es fallar: el asiento queda FALLIDO, visible, y se reintenta
   * solo en cuanto alguien precargue el plan de cuentas.
   */
  it('sin la cuenta puente 399 configurada: falla, y queda en la bandeja', async () => {
    const { servicio, guardadas } = crearArnes({ sinCuentas: ['CAPITAL|399'] });
    await expect(
      servicio.generarAsientoDeInventarioInicial({
        empresaId: 'emp-1',
        fecha: new Date(),
        detalles: [{ productoId: 'prod-1', cantidad: 1, costoUnitario: 10 }],
      }),
    ).rejects.toThrow(/Carga de saldos iniciales/);
    expect(guardadas).toHaveLength(0);
  });
});
