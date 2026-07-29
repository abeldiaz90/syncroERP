import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PolizasService } from './polizas.service';

/**
 * Tests de CANCELACIÓN / REVERSO DE PÓLIZAS.
 *
 * Regla contable que verifican: una póliza jamás se borra ni se edita.
 * Cancelar significa emitir su REVERSA (cargos ↔ abonos invertidos),
 * dejando ambas en el libro con referencia cruzada — como el FB08 de SAP.
 *
 * No tocan SQL Server: el DataSource está simulado por completo.
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
      { id: 'p1', cuentaContableId: 'cta-caja',     cargo: 232, abono: 0 },
      { id: 'p2', cuentaContableId: 'cta-ventas',   cargo: 0,   abono: 200 },
      { id: 'p3', cuentaContableId: 'cta-iva-tras', cargo: 0,   abono: 32 },
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
        if (opts?.fallarGuardadoPartidas) throw new Error('fallo simulado al guardar partidas');
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
      if (sql.includes('cierres_contables')) {
        const clave = `${params[1]}/${params[2]}`;
        return (opts?.periodosCerrados ?? []).includes(clave) ? [{ id: 'cierre-1' }] : [];
      }
      if (sql.includes('SELECT TOP 1 folio')) return []; // primer folio del año
      return [];
    }),
    getRepository: jest.fn(() => ({
      findOne: async () => (opts?.poliza === undefined ? polizaVigente() : opts.poliza),
    })),
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(async () => { estado.commits++; }),
      rollbackTransaction: jest.fn(async () => { estado.rollbacks++; }),
      release: jest.fn(),
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
    expect(cuadra(estado.partidas!)).toBe(true);

    // La partida que cargaba 232 a caja, ahora la abona
    expect(estado.partidas).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuentaContableId: 'cta-caja',     cargo: 0,   abono: 232 }),
      expect.objectContaining({ cuentaContableId: 'cta-ventas',   cargo: 200, abono: 0 }),
      expect.objectContaining({ cuentaContableId: 'cta-iva-tras', cargo: 32,  abono: 0 }),
    ]));
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
    estado.partidas!.forEach((p) => expect(p.referencia).toBe('REV IN-2026-00001'));
  });

  it('marca la original como CANCELADA con referencia cruzada, motivo y usuario', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO, usuario: 'contador@empresa.com',
    });

    expect(estado.updates).toHaveLength(1);
    const { id, cambios } = estado.updates[0];
    expect(id).toBe('pol-1');
    expect(cambios).toEqual(expect.objectContaining({
      estatus: 'CANCELADA',
      polizaReversaId: 'pol-reversa',
      motivoCancelacion: MOTIVO,
      canceladaPor: 'contador@empresa.com',
    }));
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
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: '  ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(estado.reversa).toBeNull();
  });

  it('no permite cancelar dos veces la misma póliza', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({ estatus: 'CANCELADA' }),
    });
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Otro intento' }))
      .rejects.toThrow(/ya fue cancelada/i);
    expect(estado.reversa).toBeNull();
  });

  it('no permite cancelar una póliza que YA es una reversa', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({ estatus: 'REVERSA' }),
    });
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Cancelar la reversa' }))
      .rejects.toThrow(/es una reversa/i);
    expect(estado.reversa).toBeNull();
  });

  it('póliza inexistente → NotFound', async () => {
    const { servicio } = crearArnes({ poliza: null });
    await expect(servicio.cancelarPoliza('emp-1', 'no-existe', { motivo: 'Cualquier motivo' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('NO revierte una póliza descuadrada: avisa para revisarla', async () => {
    const { servicio, estado } = crearArnes({
      poliza: polizaVigente({
        partidas: [
          { id: 'p1', cuentaContableId: 'cta-caja',   cargo: 100, abono: 0 },
          { id: 'p2', cuentaContableId: 'cta-ventas', cargo: 0,   abono: 90 }, // ← descuadre
        ],
      }),
    });
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Intento de reverso' }))
      .rejects.toThrow(/descuadrada/i);
    expect(estado.reversa).toBeNull();
  });

  it('póliza sin partidas → rechazada', async () => {
    const { servicio } = crearArnes({ poliza: polizaVigente({ partidas: [] }) });
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Sin partidas' }))
      .rejects.toBeInstanceOf(BadRequestException);
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
      poliza: polizaVigente({ fecha: new Date('2026-03-15T00:00:00'), mes: 3, anio: 2026 }),
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
      poliza: polizaVigente({ fecha: new Date('2026-03-15T00:00:00'), mes: 3, anio: 2026 }),
      periodosCerrados: ['3/2026', periodoHoy],
    });
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: MOTIVO }))
      .rejects.toThrow(/cerrado/i);
    expect(estado.reversa).toBeNull();
  });

  it('fecha de reverso indicada dentro de un período cerrado → rechazada', async () => {
    const { servicio, estado } = crearArnes({ periodosCerrados: ['3/2026'] });
    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO, fechaReverso: '2026-03-10',
    })).rejects.toThrow(/cerrado/i);
    expect(estado.reversa).toBeNull();
  });

  it('fecha de reverso indicada en período abierto → se respeta', async () => {
    const { servicio, estado } = crearArnes();
    await servicio.cancelarPoliza('emp-1', 'pol-1', {
      motivo: MOTIVO, fechaReverso: '2026-09-30',
    });
    expect(estado.reversa.mes).toBe(9);
    expect(estado.reversa.anio).toBe(2026);
  });
});

// ═══════════════════ ATOMICIDAD ═══════════════════

describe('cancelarPoliza — transacción', () => {
  it('si falla el guardado de partidas: rollback y la original NO queda marcada', async () => {
    const { servicio, estado } = crearArnes({ fallarGuardadoPartidas: true });

    await expect(servicio.cancelarPoliza('emp-1', 'pol-1', { motivo: 'Fallo simulado' }))
      .rejects.toThrow();

    expect(estado.rollbacks).toBe(1);
    expect(estado.commits).toBe(0);
    expect(estado.updates).toHaveLength(0); // la original quedó intacta
  });
});
