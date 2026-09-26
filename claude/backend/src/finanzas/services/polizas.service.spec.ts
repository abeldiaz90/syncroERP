import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PolizasService } from './polizas.service';

/**
 * Tests de CANCELACIÓN / REVERSO DE PÓLIZAS.
 *
 * Regla contable que verifican: una póliza jamás se borra ni se edita.
 * Cancelar significa emitir su REVERSA (cargos ↔ abonos invertidos),
 * dejando ambas en el libro con referencia cruzada — como el FB08 de SAP.
 *
 * No tocan PostgreSQL: el DataSource está simulado por completo.
 * Correr:  npm test -- polizas.service
 */

// ═══════════════════ ARNÉS ═══════════════════

/** Póliza de ejemplo: venta de contado, cuadrada, del 15/07/2026. */
function polizaVigente(extra: Partial<any> = {}) {
  return {
    id: 'pol-1',
    empresaId: 'emp-1',
    tipo: 'INGRESO',
    folio: 'IN-2026-00001',
    fecha: new Date('2026-07-15T00:00:00'),
    mes: 7,
    anio: 2026,
    concepto: 'Ingresos — Ticket #101',
    estatus: 'VIGENTE',
    partidas: [
      { id: 'p1', cuentaContableId: 'cta-caja', cargo: 232, abono: 0 },
      { id: 'p2', cuentaContableId: 'cta-ventas', cargo: 0, abono: 200 },
      { id: 'p3', cuentaContableId: 'cta-iva-tras', cargo: 0, abono: 32 },
    ],
    ...extra,
  };
}

function crearArnes(opts?: {
  poliza?: any | null;
  /** Períodos cerrados en formato 'mes/anio'. Ej: ['7/2026'] */
  periodosCerrados?: string[];
  fallarGuardadoPartidas?: boolean;
}) {
  const estado = {
    reversa: null as any,
    partidas: null as any[] | null,
    updates: [] as Array<{ id: string; cambios: any }>,
    commits: 0,
    rollbacks: 0,
  };

  const manager = {
    create: (_entidad: any, obj: any) => obj,
    save: jest.fn(async (a: any, b?: any) => {
      if (Array.isArray(b)) {
        if (opts?.fallarGuardadoPartidas)
          throw new Error('fallo simulado al guardar partidas');
        estado.partidas = b;
        return b;
      }
      estado.reversa = { ...a, id: 'pol-reversa' };
      return estado.reversa;
    }),
    update: jest.fn(async (_entidad: any, id: string, cambios: any) => {
      estado.updates.push({ id, cambios });
      return { affected: 1 };
    }),
  };

  const dataSource: any = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return [{ resultado: 0 }];
      if (sql.includes('cierres_contables')) {
        const clave = `${params[1]}/${params[2]}`;
        return (opts?.periodosCerrados ?? []).includes(clave)
          ? [{ id: 'cierre-1' }]
          : [];
      }
      if (sql.includes('SELECT folio FROM polizas')) return []; // primer folio del año
      return [];
    }),
    getRepository: jest.fn(() => ({
      findOne: async () =>
        opts?.poliza === undefined ? polizaVigente() : opts.poliza,
    })),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(async () => {
        estado.commits++;
      }),
      rollbackTransaction: jest.fn(async () => {
        estado.rollbacks++;
      }),
      release: jest.fn(),
      query: jest.fn((sql: string, params: any[] = []) =>
        dataSource.query(sql, params),
      ),
      manager,
    }),
  };

  return { servicio: new PolizasService(dataSource), estado };
}

const cuadra = (partidas: any[]) => {
  const c = partidas.reduce((s, p) => s + Number(p.cargo), 0);
  const a = partidas.reduce((s, p) => s + Number(p.abono), 0);
  return Math.round(c * 100) === Math.round(a * 100);
};

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

// ═══════════════════ EL REVERSO ═══════════════════

describe('cancelarPoliza — la reversa', () => {
  const MOTIVO = 'Ticket cancelado por el cliente';

  it('invierte cargos y abonos, conserva las cuentas y cuadra', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });

    expect(estado.partidas).toHaveLength(3);
    expect(cuadra(estado.partidas)).toBe(true);

    // La partida que cargaba 232 a caja, ahora la abona
    expect(estado.partidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cuentaContableId: 'cta-caja',
          cargo: 0,
          abono: 232,
        }),
        expect.objectContaining({
          cuentaContableId: 'cta-ventas',
          cargo: 200,
          abono: 0,
        }),
        expect.objectContaining({
          cuentaContableId: 'cta-iva-tras',
          cargo: 32,
          abono: 0,
        }),
      ]),
    );
  });

  it('hereda el tipo de la original y se identifica como REVERSA ligada a su origen', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });

    expect(estado.reversa.tipo).toBe('INGRESO');
    expect(estado.reversa.estatus).toBe('REVERSA');
    expect(estado.reversa.polizaOrigenId).toBe('pol-1');
    expect(estado.reversa.concepto).toContain('IN-2026-00001');
    expect(estado.reversa.concepto).toContain(MOTIVO);
  });

  it('cada partida de la reversa referencia el folio original', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });
    estado.partidas.forEach((p) =>
      expect(p.referencia).toBe('REV IN-2026-00001'),
    );
  });

  it('marca la original como CANCELADA con referencia cruzada, motivo y usuario', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO,
      usuario: 'contador@empresa.com',
    });

    expect(estado.updates).toHaveLength(1);
    const { id, cambios } = estado.updates[0];
    expect(id).toBe('pol-1');
    expect(cambios).toEqual(
      expect.objectContaining({
        estatus: 'CANCELADA',
        polizaReversaId: 'pol-reversa',
        motivoCancelacion: MOTIVO,
        canceladaPor: 'contador@empresa.com',
      }),
    );
    expect(cambios.fechaCancelacion).toBeInstanceOf(Date);
  });

  it('confirma la transacción una sola vez y sin rollback', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });
    expect(estado.commits).toBe(1);
    expect(estado.rollbacks).toBe(0);
  });
});

// ═══════════════════ CANDADOS ═══════════════════

describe('cancelarPoliza — candados', () => {
  it('exige motivo (rastro de auditoría)', async () => {
    const { servicio, estado } = crearArnes();
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(estado.reversa).toBeNull();
  });

  it('no permite cancelar dos veces la misma póliza', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({ estatus: 'CANCELADA' }),
    });
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Otro intento' }),
    ).rejects.toThrow(/ya fue cancelada/i);
    expect(estado.reversa).toBeNull();
  });

  it('no permite cancelar una póliza que YA es una reversa', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({ estatus: 'REVERSA' }),
    });
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', {
        motivo: 'Cancelar la reversa',
      }),
    ).rejects.toThrow(/es una reversa/i);
    expect(estado.reversa).toBeNull();
  });

  it('póliza inexistente → NotFound', async () => {
    const { servicio } = crearArnes({ poliza: null });
    await expect(
      servicio.cancelarPoliza('emp-1', 'no-existe', {
        motivo: 'Cualquier motivo',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('NO revierte una póliza descuadrada: avisa para revisarla', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({
        partidas: [
          { id: 'p1', cuentaContableId: 'cta-caja', cargo: 100, abono: 0 },
          { id: 'p2', cuentaContableId: 'cta-ventas', cargo: 0, abono: 90 }, // ← descuadre
        ],
      }),
    });
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', {
        motivo: 'Intento de reverso',
      }),
    ).rejects.toThrow(/descuadrada/i);
    expect(estado.reversa).toBeNull();
  });

  it('póliza sin partidas → rechazada', async () => {
    const { servicio } = crearArnes({
      poliza: polizaVigente({ partidas: [] }),
    });
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Sin partidas' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ═══════════════════ PERÍODOS CONTABLES ═══════════════════

describe('cancelarPoliza — períodos contables', () => {
  const MOTIVO = 'Error de captura';

  it('período original ABIERTO: la reversa usa la misma fecha de la original', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });
    expect(estado.reversa.mes).toBe(7);
    expect(estado.reversa.anio).toBe(2026);
  });

  it('período original CERRADO: la reversa se emite con fecha de hoy, sin tocar el pasado', async () => {
    const hoy = new Date();
    // Póliza vieja (marzo) con su período cerrado; el período de hoy está abierto.
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({
        fecha: new Date('2026-03-15T00:00:00'),
        mes: 3,
        anio: 2026,
      }),
      periodosCerrados: ['3/2026'],
    });
    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });

    expect(estado.reversa.mes).toBe(hoy.getMonth() + 1);
    expect(estado.reversa.anio).toBe(hoy.getFullYear());
    expect(estado.commits).toBe(1);
  });

  it('original cerrada Y período actual también cerrado: rechaza (hay que reabrir el período)', async () => {
    const hoy = new Date();
    const periodoHoy = `${hoy.getMonth() + 1}/${hoy.getFullYear()}`;
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({
        fecha: new Date('2026-03-15T00:00:00'),
        mes: 3,
        anio: 2026,
      }),
      periodosCerrados: ['3/2026', periodoHoy],
    });
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO }),
    ).rejects.toThrow(/cerrado/i);
    expect(estado.reversa).toBeNull();
  });

  it('fecha de reverso indicada dentro de un período cerrado → rechazada', async () => {
    const { servicio, estado } = crearArnes({ periodosCerrados: ['3/2026'] });
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', {
        motivo: MOTIVO,
        fechaReverso: '2026-03-10',
      }),
    ).rejects.toThrow(/cerrado/i);
    expect(estado.reversa).toBeNull();
  });

  /*
   * La fecha era '2026-09-30', escrita cuando esa fecha ya había pasado. Al
   * entrar el control de fecha futura la prueba se cayó, y con razón: pedía
   * que se respetara una fecha que todavía no llega. Se cambia por un día
   * cualquiera del mismo período abierto, que es lo que la prueba quería
   * decir; la fecha concreta nunca fue el punto.
   */
  it('fecha de reverso indicada en período abierto → se respeta', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO,
      fechaReverso: '2026-09-10',
    });
    expect(estado.reversa.mes).toBe(9);
    expect(estado.reversa.anio).toBe(2026);
  });
});

/**
 * ============================================================================
 * La contabilidad registra lo que ya pasó
 * ----------------------------------------------------------------------------
 * No había control de fecha futura. Se registró y se pagó la nómina del 1 al
 * 15 de OCTUBRE el 23 de septiembre, con su póliza de devengo fechada 22 días
 * adelante, y el ERP no dijo nada. Lo dijo el mayor externo cuando le llegó el
 * asiento: «The journal entry cannot be made for a future date».
 * ============================================================================
 */
describe('Ninguna póliza se fecha en un día que no ha llegado', () => {
  const MOTIVO = 'Fecha equivocada en la captura';
  const enDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  };

  it('rechaza el día de mañana, y lo dice nombrando la fecha', async () => {
    const { servicio, estado } = crearArnes();
    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', {
        motivo: MOTIVO,
        fechaReverso: enDias(1),
      }),
    ).rejects.toThrow(/todavía no llega/i);
    expect(estado.reversa).toBeNull();
  });

  /*
   * Hoy SÍ pasa, y no es un detalle: el control compara contra el final del
   * día local. Comparando contra el instante actual, capturar a las 9 de la
   * mañana una póliza fechada hoy la declararía futura por catorce horas.
   */
  it('acepta hoy, a cualquier hora del día', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO,
      fechaReverso: enDias(0),
    });
    expect(estado.reversa).not.toBeNull();
  });

  it('acepta el pasado: lo que ya ocurrió se registra', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO,
      fechaReverso: enDias(-1),
    });
    expect(estado.reversa).not.toBeNull();
  });
});

/**
 * ============================================================================
 * El control que tapaba la única salida del problema que evitaba
 * ----------------------------------------------------------------------------
 * La regla «ninguna póliza se fecha en un día que no ha llegado» vivía dentro
 * de `aFecha`, que además de validar NORMALIZA. Y la reversa empieza leyendo la
 * fecha de la póliza ORIGINAL con esa misma función.
 *
 * Resultado: las pólizas que ya estaban fechadas adelante —las que se
 * capturaron antes de que el control existiera— no se podían cancelar. Al
 * intentarlo:
 *
 *   «No se puede registrar una póliza con fecha 2026-10-15, que todavía no
 *    llega.»
 *
 * ...dicho a quien no estaba registrando nada, sino intentando arreglar
 * exactamente eso. Medido el 25-sep-2026 contra la instalación: DI-2026-00013
 * (15-oct) y EG-2026-00013 (30-sep) llevaban dos días atoradas en la bandeja
 * del espejo contable, rechazadas por Fineract, sin forma de reversarlas.
 *
 * Normalizar no es validar. La regla se aplica donde se ESCRIBE una fecha.
 * ============================================================================
 */
describe('Una póliza ya fechada adelante se puede cancelar', () => {
  const MOTIVO = 'Fecha de captura equivocada';
  const enDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return new Date(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}T00:00:00`,
    );
  };

  it('se puede reversar, aunque su fecha todavía no haya llegado', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({
        folio: 'DI-2026-00013',
        fecha: enDias(20),
        mes: enDias(20).getMonth() + 1,
        anio: enDias(20).getFullYear(),
      }),
    });

    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });

    expect(estado.reversa).not.toBeNull();
  });

  it('y la reversa NO hereda la fecha futura: se fecha hoy', async () => {
    /*
     * Heredarla sería fabricar una segunda póliza futura y dejar las dos
     * atoradas: el mayor externo rechaza igual la reversa. Se cancela hoy, que
     * es cuando de verdad se está cancelando.
     */
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({ fecha: enDias(20) }),
    });

    await servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO });

    const fechaReversa = new Date(estado.reversa.fecha);
    expect(fechaReversa.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('pero seguir fechando adelante sigue prohibido', () => {
    // La salida de emergencia no puede convertirse en la puerta principal.
    const { servicio } = crearArnes();
    return expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', {
        motivo: MOTIVO,
        fechaReverso: `${enDias(5).getFullYear()}-${String(
          enDias(5).getMonth() + 1,
        ).padStart(2, '0')}-${String(enDias(5).getDate()).padStart(2, '0')}`,
      }),
    ).rejects.toThrow(/todavía no llega/i);
  });
});

// ═══════════════════ ATOMICIDAD ═══════════════════

describe('cancelarPoliza — transacción', () => {
  it('si falla el guardado de partidas: rollback y la original NO queda marcada', async () => {
    const { servicio, estado } = crearArnes({ fallarGuardadoPartidas: true });

    await expect(
      servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Fallo simulado' }),
    ).rejects.toThrow();

    expect(estado.rollbacks).toBe(1);
    expect(estado.commits).toBe(0);
    expect(estado.updates).toHaveLength(0); // la original quedó intacta
  });
});
