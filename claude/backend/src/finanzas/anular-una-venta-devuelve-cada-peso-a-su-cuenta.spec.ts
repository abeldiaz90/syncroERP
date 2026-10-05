import { Logger } from '@nestjs/common';
import { MotorContableService } from './services/motor-contable.service';
import { Poliza, TipoPoliza } from './entities/poliza.entity';
import { PartidaPoliza } from './entities/partida-poliza.entity';

/**
 * ============================================================================
 * ANULAR UNA VENTA DEVUELVE CADA PESO A LA CUENTA DE LA QUE SALIÓ
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * Una venta a crédito **con enganche** no es un solo movimiento:
 *
 *     Dr. Caja ............... 116.00   el enganche, que sí entró
 *     Dr. Clientes (CxC) ..... 116.00   el remanente, que se debe
 *       Cr. Ventas ........... 200.00
 *       Cr. IVA cobrado (208) .. 16.00   el IVA de la parte cobrada
 *       Cr. IVA no cobrado (209) 16.00   el de la parte a crédito
 *
 * Al anularla, la reversión no recibía el enganche —su firma no lo contempla—
 * así que abonaba **el total a la cuenta por cobrar** y cargaba **todo el IVA a
 * una sola cuenta**:
 *
 *     Dr. Ventas ............. 200.00
 *     Dr. IVA no cobrado ...... 32.00   ← 16 de más
 *       Cr. Clientes ......... 232.00   ← 116 de más
 *
 * Consecuencias, todas permanentes y ninguna visible:
 *
 *   · el 208 queda abonado para siempre: impuesto cobrado de una venta anulada,
 *     que se le sigue enterando al SAT;
 *   · el 209 queda cargado de más;
 *   · la cuenta por cobrar se abona por dinero que nunca estuvo en ella;
 *   · **Caja no se toca**: el enganche nunca salió, aunque la venta ya no exista.
 *
 * Y LA PÓLIZA CUADRA. Ése es el punto entero: cargos 232, abonos 232. Nada
 * falla, ningún proceso se detiene, y el descuadre vive en el detalle de las
 * cuentas, que es donde nadie mira hasta que alguien concilia el mes.
 *
 * EL ARREGLO, Y POR QUÉ NO ES «PASARLE TAMBIÉN EL ENGANCHE»
 *
 * Pasarle el enganche habría tapado este caso y dejado el mecanismo intacto: dos
 * lógicas —la que arma la venta y la que la deshace— que hay que mantener
 * sincronizadas a mano. Ya se habían separado dos veces: primero con el saldo a
 * favor (se tapó bloqueando la anulación, que es renunciar a la operación) y
 * después con el enganche.
 *
 * La reversión ahora **espeja la póliza original**: lee las partidas de
 * `VENTA:<id>:INGRESO` e invierte cargo y abono. No necesita saber cómo se
 * repartió el cobro, porque la póliza ya lo dice. Un componente nuevo en la
 * venta se revierte solo el día que se invente.
 * ============================================================================
 */

const CUENTA_CAJA = 'cta-caja';
const CUENTA_CXC = 'cta-clientes';
const CUENTA_VENTAS = 'cta-ventas';
const CUENTA_IVA_COBRADO = 'cta-208';
const CUENTA_IVA_NO_COBRADO = 'cta-209';
const CUENTA_SALDO_FAVOR = 'cta-206';

type PolizaGuardada = { poliza: any; partidas: any[] };

/**
 * El asiento que dejó la venta a crédito con enganche: 116 de enganche sobre
 * un total de 232, así que la mitad del IVA se cobró y la mitad no.
 */
const PARTIDAS_DE_LA_VENTA = [
  { cuentaContableId: CUENTA_CAJA, cargo: 116, abono: 0 },
  { cuentaContableId: CUENTA_CXC, cargo: 116, abono: 0 },
  { cuentaContableId: CUENTA_VENTAS, cargo: 0, abono: 200 },
  { cuentaContableId: CUENTA_IVA_COBRADO, cargo: 0, abono: 16 },
  { cuentaContableId: CUENTA_IVA_NO_COBRADO, cargo: 0, abono: 16 },
];

const PARTIDAS_DE_COSTO = [
  { cuentaContableId: 'cta-costo-ventas', cargo: 120, abono: 0 },
  { cuentaContableId: 'cta-inventario', cargo: 0, abono: 120 },
];

function crearArnes(opts?: {
  polizasDeOrigen?: Record<string, Array<Record<string, number | string>>>;
}) {
  const guardadas: PolizaGuardada[] = [];
  let pendiente: any = null;
  const origen = opts?.polizasDeOrigen ?? {};

  const manager = {
    create: (_ent: any, obj: any) => obj,
    findOne: jest.fn(async () => null),
    save: jest.fn(async (entOrObj: any, maybeArr?: any) => {
      if (Array.isArray(maybeArr)) {
        guardadas.push({ poliza: pendiente, partidas: maybeArr });
        return maybeArr;
      }
      pendiente = { ...entOrObj, id: `pol-${guardadas.length + 1}` };
      return pendiente;
    }),
  };

  const dataSource: any = {
    query: jest.fn(async () => []),
    getRepository: jest.fn((entidad: any) => {
      if (entidad === Poliza) {
        return {
          findOne: async ({ where }: any) =>
            origen[where.origenClave]
              ? { id: `orig-${where.origenClave}`, ...where }
              : null,
        };
      }
      if (entidad === PartidaPoliza) {
        return {
          find: async ({ where }: any) => {
            const clave = String(where.polizaId).replace('orig-', '');
            return origen[clave] ?? [];
          },
        };
      }
      /* Catálogo de cuentas: nada de lo que se espeja pasa por aquí. */
      return {
        createQueryBuilder: () => {
          const qb: any = {
            where: () => qb,
            andWhere: () => qb,
            orderBy: () => qb,
            getOne: async () => ({ id: CUENTA_CAJA }),
          };
          return qb;
        },
        findOne: async () => null,
      };
    }),
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
      getMany: async () => [
        {
          id: 'prod-1',
          nombre: 'Producto de prueba',
          tipo: 'ARTICULO',
          categoria: {
            cuentaVentasId: CUENTA_VENTAS,
            cuentaInventarioId: 'cta-inventario',
            cuentaCostoVentasId: 'cta-costo-ventas',
          },
        },
      ],
    }),
  };

  return {
    servicio: new MotorContableService(dataSource, productoRepo),
    guardadas,
  };
}

const anulacion = (extra: Record<string, unknown> = {}) => ({
  ventaId: 'v-eng',
  folio: '301',
  fecha: new Date('2026-09-30'),
  empresaId: 'emp-1',
  motivo: 'El cliente se arrepintió.',
  metodoPago: 'CREDITO_30D',
  detalles: [
    {
      productoId: 'prod-1',
      cantidad: 2,
      subtotal: 200,
      impuestoMonto: 32,
      costoTotal: 120,
    },
  ],
  ...extra,
});

const conLaVentaRegistrada = () =>
  crearArnes({
    polizasDeOrigen: {
      'VENTA:v-eng:INGRESO': PARTIDAS_DE_LA_VENTA,
      'VENTA:v-eng:COSTO': PARTIDAS_DE_COSTO,
    },
  });

/** La de ingreso es la de tipo EGRESO; la de costo es DIARIO. */
const ingresoDe = (g: PolizaGuardada[]) =>
  g.find((x) => x.poliza.tipo === TipoPoliza.EGRESO)!;
const costoDe = (g: PolizaGuardada[]) =>
  g.find((x) => x.poliza.tipo === TipoPoliza.DIARIO)!;

const importeEn = (partidas: any[], cuenta: string, lado: 'cargo' | 'abono') =>
  partidas
    .filter((p) => p.cuentaContableId === cuenta)
    .reduce((s, p) => s + Number(p[lado] ?? 0), 0);

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('anular una venta a crédito con enganche', () => {
  it('le devuelve a Caja el enganche que había entrado', async () => {
    /*
     * El renglón que no existía. Sin él, la venta desaparece y el dinero del
     * enganche se queda en Caja para siempre: la caja cuadra de más y nadie
     * sabe contra qué.
     */
    const { servicio, guardadas } = conLaVentaRegistrada();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());

    expect(importeEn(ingresoDe(guardadas).partidas, CUENTA_CAJA, 'abono')).toBe(
      116,
    );
  });

  it('abona a cuentas por cobrar sólo el remanente, no el total', async () => {
    const { servicio, guardadas } = conLaVentaRegistrada();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());

    expect(importeEn(ingresoDe(guardadas).partidas, CUENTA_CXC, 'abono')).toBe(
      116,
    );
  });

  it('reparte el IVA entre cobrado y no cobrado igual que la venta', async () => {
    /*
     * Lo que impide enterarle al SAT el impuesto de una venta que no ocurrió.
     * Cargar los 32 al 209 dejaba el 208 abonado para siempre.
     */
    const { servicio, guardadas } = conLaVentaRegistrada();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());
    const partidas = ingresoDe(guardadas).partidas;

    expect(importeEn(partidas, CUENTA_IVA_COBRADO, 'cargo')).toBe(16);
    expect(importeEn(partidas, CUENTA_IVA_NO_COBRADO, 'cargo')).toBe(16);
  });

  it('y el asiento cuadra, que es lo que lo hacía invisible', async () => {
    const { servicio, guardadas } = conLaVentaRegistrada();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());

    for (const g of guardadas) {
      const cargos = g.partidas.reduce((s, p) => s + Number(p.cargo), 0);
      const abonos = g.partidas.reduce((s, p) => s + Number(p.abono), 0);
      expect(Math.round(cargos * 100)).toBe(Math.round(abonos * 100));
    }
  });

  it('toca exactamente las mismas cuentas que tocó la venta, ni una más', async () => {
    /*
     * La propiedad que hace que esto no se vuelva a separar: la reversión no
     * elige cuentas, las hereda. Si mañana la venta aprende un componente
     * nuevo, aparece aquí sin tocar nada.
     */
    const { servicio, guardadas } = conLaVentaRegistrada();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());

    const cuentasReversadas = new Set(
      ingresoDe(guardadas).partidas.map((p) => p.cuentaContableId),
    );
    const cuentasDeLaVenta = new Set(
      PARTIDAS_DE_LA_VENTA.map((p) => p.cuentaContableId),
    );
    expect([...cuentasReversadas].sort()).toEqual([...cuentasDeLaVenta].sort());
  });

  it('el costo también se espeja, no se recalcula', async () => {
    const { servicio, guardadas } = conLaVentaRegistrada();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());
    const partidas = costoDe(guardadas).partidas;

    expect(importeEn(partidas, 'cta-inventario', 'cargo')).toBe(120);
    expect(importeEn(partidas, 'cta-costo-ventas', 'abono')).toBe(120);
  });
});

describe('anular una venta que aplicó saldo a favor del cliente', () => {
  it('restituye el pasivo con el cliente, sin que nadie tenga que acordarse', async () => {
    /*
     * Antes esto no se podía ni intentar: la anulación se bloqueaba porque la
     * reversión no sabía del saldo a favor. El bloqueo era correcto para el
     * código que había y renunciaba a una operación legítima. Con el espejo, la
     * restitución sale de la propia póliza.
     */
    const { servicio, guardadas } = crearArnes({
      polizasDeOrigen: {
        'VENTA:v-eng:INGRESO': [
          { cuentaContableId: CUENTA_SALDO_FAVOR, cargo: 50, abono: 0 },
          { cuentaContableId: CUENTA_CXC, cargo: 182, abono: 0 },
          { cuentaContableId: CUENTA_VENTAS, cargo: 0, abono: 200 },
          { cuentaContableId: CUENTA_IVA_COBRADO, cargo: 0, abono: 7 },
          { cuentaContableId: CUENTA_IVA_NO_COBRADO, cargo: 0, abono: 25 },
        ],
      },
    });
    await servicio.generarAsientoDeCancelacionVenta(anulacion());

    expect(
      importeEn(ingresoDe(guardadas).partidas, CUENTA_SALDO_FAVOR, 'abono'),
    ).toBe(50);
  });
});

describe('cuando la venta no tiene póliza que espejar', () => {
  it('se detiene si llevó enganche, en vez de repartir mal y cuadrar', async () => {
    /*
     * Entre mentir y detenerse, se detiene: la misma doctrina que ya gobierna
     * la anulación de ventas anteriores al costeo por lote. Sin la póliza no
     * hay forma de saber cuánto fue enganche, y una póliza cuadrada con las
     * cuentas mal es peor que un error.
     */
    const { servicio, guardadas } = crearArnes();
    await expect(
      servicio.generarAsientoDeCancelacionVenta(
        anulacion({ enganche: 116 }),
      ),
    ).rejects.toThrow(/no existe la póliza de ingreso/i);
    expect(guardadas.find((g) => g.poliza.tipo === TipoPoliza.EGRESO)).toBeUndefined();
  });

  it('el «no» dice cuánto fue el enganche y qué hacer en su lugar', async () => {
    const { servicio } = crearArnes();
    const error = await servicio
      .generarAsientoDeCancelacionVenta(anulacion({ enganche: 116 }))
      .catch((e: Error) => e);
    const mensaje = String((error as Error).message);
    expect(mensaje).toContain('116.00');
    expect(mensaje).toMatch(/devoluci[óo]n/i);
    expect(mensaje).toMatch(/ninguna p[óo]liza fue creada/i);
  });

  it('también se detiene si aplicó saldo a favor', async () => {
    const { servicio } = crearArnes();
    await expect(
      servicio.generarAsientoDeCancelacionVenta(
        anulacion({ saldoFavorAplicado: 50 }),
      ),
    ).rejects.toThrow(/saldo a favor/i);
  });

  it('pero una venta a crédito cobrada de una sola vez sigue reversándose', async () => {
    /*
     * El caso que NO hay que romper. Sin enganche ni saldo a favor, todo el IVA
     * fue «no cobrado» y todo el importe está en cuentas por cobrar: el cálculo
     * acierta. Bloquearlo también sería cambiar un defecto por una avería.
     */
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeCancelacionVenta(anulacion());

    expect(ingresoDe(guardadas)).toBeDefined();
  });
});

describe('el dato que hace sonar el guardia sale de donde vive', () => {
  /*
   * ESTRUCTURAL, Y CON MOTIVO MEDIDO.
   *
   * Un mutante deliberado puso `enganche: 0` en el payload de la anulación y
   * **las once pruebas de arriba siguieron verdes**: todas montan el motor
   * contable directamente, así que ninguna recorre el camino por el que el dato
   * llega. Sin esta aserción, quitar ese campo devuelve en silencio el defecto
   * original para toda venta sin póliza de origen.
   *
   * Montar `AnulacionVentasService` entero —transacción, inventario, crédito,
   * CFDI— mediría el armado del doble y no esto. La aserción se queda donde el
   * valor se compone.
   */
  const fuente = require('fs').readFileSync(
    require('path').join(
      __dirname,
      '..',
      'ventas',
      'services',
      'anulacion-ventas.service.ts',
    ),
    'utf8',
  ) as string;

  it('el enganche se lee del crédito, que es donde se guarda', () => {
    /* No está en `Venta`: el crédito nace por el remanente de lo que el
       cliente dejó en caja, y el enganche es un campo suyo. */
    expect(fuente).toContain('enganche: Number(credito?.enganche ?? 0)');
  });

  it('y el saldo a favor viaja con él', () => {
    expect(fuente).toContain(
      'saldoFavorAplicado: Number(venta.saldoFavorAplicado ?? 0)',
    );
  });

  it('ya no se bloquea la anulación por haber aplicado saldo a favor', () => {
    /*
     * El bloqueo era correcto mientras la reversión recalculaba. Con el espejo
     * sobra, y dejarlo sería renunciar a una operación legítima por una razón
     * que ya no existe. Si alguien lo repone, esta prueba lo dice.
     */
    expect(fuente).not.toMatch(
      /de saldo a favor del cliente\. Anularla dejaría ese saldo sin restituir/,
    );
  });
});

/**
 * ============================================================================
 * LA MISMA PIEZA, EN LA CANCELACIÓN DE COBRANZA
 * ----------------------------------------------------------------------------
 * `generarAsientoDeCobranza` y `generarAsientoDeCancelacionCobranza` son
 * gemelas: las mismas cuentas, los mismos importes, los lados invertidos. Hoy
 * coinciden, y por eso aquí no había un defecto que arreglar.
 *
 * Pero son dos funciones de casi doscientas líneas cada una, y que sigan
 * coincidiendo depende de que quien toque una se acuerde de la otra. Así
 * empezaron los dos descuadres de este mismo día. En una SOFOM la cobranza es
 * justo donde más conceptos se agregan —moratorios, comisiones, cargos por
 * atraso—, así que es la que más probabilidades tiene de separarse.
 *
 * Estas pruebas fijan que la cancelación salga del espejo, y que el cálculo
 * siga ahí para los pagos sin póliza de origen.
 * ============================================================================
 */

const PARTIDAS_DEL_COBRO = [
  { cuentaContableId: 'cta-caja', cargo: 1160, abono: 0 },
  { cuentaContableId: 'cta-clientes', cargo: 0, abono: 1000 },
  { cuentaContableId: 'cta-intereses', cargo: 0, abono: 160 },
  /* La reclasificación del IVA al cobrarse: sale del 209, entra al 208. */
  { cuentaContableId: 'cta-209', cargo: 25, abono: 0 },
  { cuentaContableId: 'cta-208', cargo: 0, abono: 25 },
];

const cancelacionDeCobro = {
  pagoId: 'pago-1',
  creditoId: 'credito-12345678',
  folioCredito: 'CRD-2026-0011',
  fechaCancelacion: new Date('2026-09-30'),
  empresaId: 'emp-1',
  montoCapital: 1000,
  montoInteres: 160,
  ivaReclasificado: 25,
  totalPagado: 1160,
  motivo: 'El cheque rebotó.',
};

describe('cancelar un cobro deshace exactamente el cobro', () => {
  it('invierte las cinco partidas del cobro, incluida la reclasificación del IVA', async () => {
    const { servicio, guardadas } = crearArnes({
      polizasDeOrigen: { 'COBRANZA:pago-1': PARTIDAS_DEL_COBRO },
    });
    await servicio.generarAsientoDeCancelacionCobranza(cancelacionDeCobro);

    expect(guardadas).toHaveLength(1);
    const partidas = guardadas[0].partidas;
    expect(importeEn(partidas, 'cta-caja', 'abono')).toBe(1160);
    expect(importeEn(partidas, 'cta-clientes', 'cargo')).toBe(1000);
    expect(importeEn(partidas, 'cta-intereses', 'cargo')).toBe(160);
    /* El IVA vuelve a «no cobrado», que es donde estaba antes del pago. */
    expect(importeEn(partidas, 'cta-209', 'abono')).toBe(25);
    expect(importeEn(partidas, 'cta-208', 'cargo')).toBe(25);
  });

  it('no inventa cuentas: hereda las del cobro', async () => {
    /*
     * La propiedad que hace que no se separen. Si mañana la cobranza aprende a
     * aplicar moratorios contra una cuenta nueva, la cancelación la deshace sin
     * que nadie toque esta función.
     */
    const { servicio, guardadas } = crearArnes({
      polizasDeOrigen: {
        'COBRANZA:pago-1': [
          ...PARTIDAS_DEL_COBRO,
          { cuentaContableId: 'cta-moratorios-nueva', cargo: 0, abono: 90 },
          { cuentaContableId: 'cta-caja', cargo: 90, abono: 0 },
        ],
      },
    });
    await servicio.generarAsientoDeCancelacionCobranza(cancelacionDeCobro);

    expect(
      importeEn(guardadas[0].partidas, 'cta-moratorios-nueva', 'cargo'),
    ).toBe(90);
  });

  it('queda enlazada al pago que deshace', async () => {
    const { servicio, guardadas } = crearArnes({
      polizasDeOrigen: { 'COBRANZA:pago-1': PARTIDAS_DEL_COBRO },
    });
    await servicio.generarAsientoDeCancelacionCobranza(cancelacionDeCobro);

    expect(guardadas[0].poliza.origenClave).toBe('CANCELACION_COBRANZA:pago-1');
  });

  it('sin póliza de origen sigue calculando, que es correcto para este caso', async () => {
    /*
     * A diferencia de la anulación de venta, aquí el cálculo no tiene ningún
     * caso que no sepa reconstruir: recibe capital, interés, IVA y total. Por
     * eso el respaldo se queda en vez de detenerse — detenerlo sería quitar
     * una operación que funciona para los pagos anteriores a la clave de origen.
     */
    const { servicio, guardadas } = crearArnes();
    await servicio.generarAsientoDeCancelacionCobranza(cancelacionDeCobro);

    expect(guardadas).toHaveLength(1);
    const cargos = guardadas[0].partidas.reduce(
      (s, p) => s + Number(p.cargo),
      0,
    );
    const abonos = guardadas[0].partidas.reduce(
      (s, p) => s + Number(p.abono),
      0,
    );
    expect(Math.round(cargos * 100)).toBe(Math.round(abonos * 100));
  });
});
