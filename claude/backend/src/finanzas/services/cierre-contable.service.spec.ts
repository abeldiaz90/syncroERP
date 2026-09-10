import { BadRequestException } from '@nestjs/common';
import { CierreContableService } from './cierre-contable.service';

describe('CierreContableService — cierre mensual guiado', () => {
  const cierreRepo = {
    findOne: jest.fn(),
    find: jest.fn(async () => []),
  };
  const revisionRepo = {
    findOne: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((valor) => valor),
    save: jest.fn(async (valor) => ({
      id: 'revision-1',
      fechaCreacion: new Date(),
      ...valor,
    })),
  };
  const eventoRepo = { find: jest.fn(async () => []) };
  const activacion = { exigirActiva: jest.fn(async () => undefined) };
  let pendientes: any[] = [];

  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('WITH totales')) {
        return [
          {
            totalPolizas: 3,
            totalPartidas: 9,
            totalDebe: 1000,
            totalHaber: 1000,
            polizasSinPartidas: 0,
            polizasDescuadradas: 0,
          },
        ];
      }
      if (sql.includes('FROM asientos_pendientes')) return pendientes;
      if (sql.includes("c.rolSistema = 'IVA_TRASLADADO_COBRADO'")) {
        // Ya representa importes netos: las reversas restan.
        return [
          {
            trasladado: 160,
            acreditable: 60,
            trasladadoNoCobrado: 32,
            acreditablePendiente: 16,
            movimientos: 6,
          },
        ];
      }
      if (sql.includes('FROM cuentas_bancarias'))
        return [{ cuentasActivas: 1 }];
      if (sql.includes('FROM tesoreria_estados_cuenta'))
        return [{ estadosCerrados: 1 }];
      if (sql.includes('FROM conciliaciones_financieras')) {
        return [
          {
            fechaCorte: '2026-07-30',
            fechaConfirmacion: new Date('2026-07-30T12:00:00'),
          },
        ];
      }
      if (sql.includes('FROM polizas') && sql.includes('GROUP BY anio, mes')) {
        return [];
      }
      throw new Error(`Consulta no simulada: ${sql}`);
    }),
  };

  let service: CierreContableService;

  beforeEach(() => {
    jest.clearAllMocks();
    pendientes = [];
    cierreRepo.findOne.mockResolvedValue(null);
    revisionRepo.findOne.mockResolvedValue(null);
    service = new CierreContableService(
      cierreRepo as any,
      revisionRepo as any,
      eventoRepo as any,
      dataSource as any,
      activacion as any,
    );
  });

  function periodoAnterior() {
    const fecha = new Date();
    fecha.setDate(1);
    fecha.setMonth(fecha.getMonth() - 1);
    return { mes: fecha.getMonth() + 1, anio: fecha.getFullYear() };
  }

  it('calcula IVA neto y produce un diagnóstico sin bloqueos', async () => {
    const periodo = periodoAnterior();
    const resultado: any = await service.iniciarRevision(
      'empresa-1',
      'usuario-1',
      periodo,
    );

    expect(resultado.snapshot.bloqueos).toBe(0);
    expect(resultado.snapshot.iva).toEqual(
      expect.objectContaining({
        trasladado: 160,
        acreditable: 60,
        ivaAPagar: 100,
        saldoAFavor: 0,
      }),
    );
  });

  it('un asiento pendiente del período bloquea la preparación', async () => {
    const periodo = periodoAnterior();
    pendientes = [
      {
        id: 'pendiente-1',
        tipo: 'VENTA',
        folioDocumento: 'VENTA-8',
        estado: 'FALLIDO',
        ultimoError: 'Falta una cuenta.',
      },
    ];
    revisionRepo.findOne.mockResolvedValue({
      id: 'revision-1',
      empresaId: 'empresa-1',
      ...periodo,
      estado: 'BORRADOR',
      snapshotJson: '{}',
      confirmacionesJson: '{}',
      version: 1,
    });

    await expect(
      service.prepararRevision('empresa-1', 'usuario-1', 'revision-1', {
        confirmaciones: {
          bancosRevisados: true,
          ivaRevisado: true,
          documentosCompletos: true,
          respaldoConfirmado: true,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no acepta confirmaciones humanas incompletas', async () => {
    const periodo = periodoAnterior();
    revisionRepo.findOne.mockResolvedValue({
      id: 'revision-1',
      empresaId: 'empresa-1',
      ...periodo,
      estado: 'BORRADOR',
      snapshotJson: '{}',
      confirmacionesJson: '{}',
      version: 1,
    });

    await expect(
      service.prepararRevision('empresa-1', 'usuario-1', 'revision-1', {
        confirmaciones: {
          bancosRevisados: true,
          ivaRevisado: false,
          documentosCompletos: true,
          respaldoConfirmado: true,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide cerrar el mes actual aunque tenga pólizas', async () => {
    const hoy = new Date();
    await expect(
      service.iniciarRevision('empresa-1', 'usuario-1', {
        mes: hoy.getMonth() + 1,
        anio: hoy.getFullYear(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
