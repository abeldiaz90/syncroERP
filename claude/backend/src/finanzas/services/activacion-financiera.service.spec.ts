import { ConflictException } from '@nestjs/common';
import {
  EstadoActivacionFinanciera,
  ModoActivacionFinanciera,
} from '../entities/activacion-financiera.entity';
import { RolCuentaSistema } from '../entities/cuenta-contable.entity';
import { ActivacionFinancieraService } from './activacion-financiera.service';

describe('ActivacionFinancieraService', () => {
  const configCompleta = {
    manejaInventario: true,
    vendeCredito: true,
    compraCredito: true,
    preciosIncluyenIVA: true,
    metodoCosteo: 'PROMEDIO',
    metodosCobro: ['EFECTIVO'],
    saldoCaja: 100,
    saldoBancos: 900,
    saldoClientes: 200,
    saldoInventario: 500,
    saldoProveedores: 300,
    confirmaSaldosIniciales: true,
    confirmaRevision: true,
  };
  let activacion: any;
  let polizasHistoricas = 0;

  const activacionRepo = {
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const cuentaRepo = {
    find: jest.fn(),
  };
  const polizaRepo = {
    count: jest.fn(async () => polizasHistoricas),
  };
  const pendienteRepo = { count: jest.fn(async () => 0) };
  const empresaRepo = {
    findOne: jest.fn(async () => ({
      rfc: 'ABC900101AA1',
      regimenFiscal: '601',
      codigoPostal: '97000',
      tipoPersonaFiscal: 'MORAL',
    })),
  };
  const fiscalRepo = {
    findOne: jest.fn(async () => ({ razonSocial: 'EMPRESA DE PRUEBA' })),
  };
  const impuestoRepo = {
    find: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const cuentasService = {
    precargarPlanEstandar: jest.fn(async () => ({ creadas: 0 })),
  };
  const polizasService = {
    crearPolizaManual: jest.fn(async () => ({ id: 'pol-apertura' })),
  };
  const catalogosSat = {
    diagnosticoMapeo: jest.fn(async () => ({
      completo: true,
      totalCuentasAfectables: 10,
      totalMapeadas: 10,
      pendientes: [],
      sinConfirmar: [],
      advertencias: [],
    })),
  };

  let service: ActivacionFinancieraService;

  beforeEach(() => {
    jest.clearAllMocks();
    polizasHistoricas = 0;
    activacion = {
      id: 'act-1',
      empresaId: 'emp-1',
      estado: EstadoActivacionFinanciera.EN_CONFIGURACION,
      modo: ModoActivacionFinanciera.GUIADO,
      pasoActual: 4,
      fechaInicioContable: new Date('2026-01-01T00:00:00'),
      empresaEnOperacion: true,
      configuracionJson: JSON.stringify(configCompleta),
      diagnosticoJson: null,
      version: 3,
      activadoPor: null,
      fechaActivacion: null,
    };
    activacionRepo.findOne.mockImplementation(async () => activacion);
    cuentaRepo.find.mockResolvedValue(
      Object.values(RolCuentaSistema).map((rol, indice) => ({
        id: `cuenta-${indice}`,
        numeroCuenta: `${100 + indice}-01`,
        nombre: rol,
        rolSistema: rol,
        activo: true,
      })),
    );
    impuestoRepo.find.mockResolvedValue(
      ['IVA 16%', 'IVA 0%', 'Exento', 'No objeto de impuesto'].map(
        (nombre) => ({
          nombre,
          empresaId: 'emp-1',
          activo: true,
        }),
      ),
    );
    service = new ActivacionFinancieraService(
      activacionRepo as any,
      cuentaRepo as any,
      polizaRepo as any,
      pendienteRepo as any,
      empresaRepo as any,
      fiscalRepo as any,
      impuestoRepo as any,
      cuentasService as any,
      polizasService as any,
      catalogosSat as any,
    );
  });

  it('bloquea modificaciones mientras Finanzas no esté activo', async () => {
    await expect(service.exigirActiva('emp-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('la simulación de apertura queda cuadrada', async () => {
    const resultado = await service.simular('emp-1');
    expect(resultado.simulacion.apertura.totalCargos).toBe(1700);
    expect(resultado.simulacion.apertura.totalAbonos).toBe(1700);
  });

  it('genera una sola póliza de apertura identificable y activa Finanzas', async () => {
    const resultado = await service.activar('emp-1', 'usuario-1');

    expect(polizasService.crearPolizaManual).toHaveBeenCalledWith(
      expect.objectContaining({
        origenClave: 'ACTIVACION_FINANCIERA:emp-1:APERTURA',
        origenTipo: 'ACTIVACION_FINANCIERA',
      }),
    );
    expect(activacion.estado).toBe(EstadoActivacionFinanciera.ACTIVO);
    expect(resultado.activa).toBe(true);
  });

  it('no duplica la apertura cuando ya existen pólizas históricas', async () => {
    polizasHistoricas = 8;
    await service.activar('emp-1', 'usuario-1');
    expect(polizasService.crearPolizaManual).not.toHaveBeenCalled();
    expect(activacion.estado).toBe(EstadoActivacionFinanciera.ACTIVO);
  });
});
