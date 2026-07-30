import { BadRequestException } from '@nestjs/common';
import { ConfiguracionMexicoService } from './configuracion-mexico.service';

describe('ConfiguracionMexicoService', () => {
  const empresa: any = {
    id: 'empresa-1',
    rfc: null,
    regimenFiscal: null,
    codigoPostal: null,
    tipoPersonaFiscal: null,
    perfilImpuestos: null,
    giro: null,
  };
  const empresaRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const cuentaRepo = { find: jest.fn() };
  const impuestoRepo = { find: jest.fn() };
  const configRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const cuentasService = {
    precargarPlanEstandar: jest.fn(async () => ({ creadas: 11 })),
  };
  const impuestoService = {
    precargarEstandar: jest.fn(async () => ({ creados: 4 })),
  };

  let service: ConfiguracionMexicoService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(empresa, {
      rfc: null,
      regimenFiscal: null,
      codigoPostal: null,
      tipoPersonaFiscal: null,
      perfilImpuestos: null,
      giro: null,
    });
    empresaRepo.findOne.mockResolvedValue(empresa);
    cuentaRepo.find.mockResolvedValue(
      [
        'CAJA',
        'CLIENTES_CXC',
        'INVENTARIO',
        'IVA_ACREDITABLE_PAGADO',
        'IVA_ACREDITABLE_PENDIENTE',
        'IVA_TRASLADADO_COBRADO',
        'IVA_TRASLADADO_NO_COBRADO',
        'PROVEEDORES',
        'VENTAS',
        'COSTO_VENTAS',
      ].map((rolSistema) => ({ rolSistema })),
    );
    impuestoRepo.find.mockResolvedValue([{ nombre: 'IVA 16%' }]);
    configRepo.findOne.mockResolvedValue(null);
    service = new ConfiguracionMexicoService(
      empresaRepo as any,
      cuentaRepo as any,
      impuestoRepo as any,
      configRepo as any,
      cuentasService as any,
      impuestoService as any,
    );
  });

  it('rechaza un régimen incompatible con el tipo de persona', async () => {
    await expect(
      service.aplicar('empresa-1', {
        tipoPersona: 'FISICA',
        rfc: 'ABCD900101AA1',
        razonSocial: 'PERSONA DE PRUEBA',
        regimenFiscal: '601',
        codigoPostal: '97000',
        perfilImpuestos: 'GENERAL',
        confirmaRevisionConContador: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no habilita IVA 8% sin confirmación expresa', async () => {
    await expect(
      service.aplicar('empresa-1', {
        tipoPersona: 'MORAL',
        rfc: 'ABC900101AA1',
        razonSocial: 'EMPRESA DE PRUEBA',
        regimenFiscal: '601',
        codigoPostal: '97000',
        perfilImpuestos: 'FRONTERA',
        confirmaRevisionConContador: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guarda claves SAT y precarga catálogos de forma guiada', async () => {
    const respuesta = await service.aplicar('empresa-1', {
      tipoPersona: 'MORAL',
      rfc: 'ABC900101AA1',
      razonSocial: 'EMPRESA DE PRUEBA',
      regimenFiscal: '601',
      codigoPostal: '97000',
      perfilImpuestos: 'GENERAL',
      confirmaRevisionConContador: true,
    });

    expect(empresa.regimenFiscal).toBe('601');
    expect(configRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        regimenFiscal: '601',
        facturamaUser: null,
        facturamaPassword: null,
      }),
    );
    expect(cuentasService.precargarPlanEstandar).toHaveBeenCalledWith(
      'empresa-1',
    );
    expect(impuestoService.precargarEstandar).toHaveBeenCalledWith(
      'empresa-1',
      false,
    );
    expect(respuesta.ok).toBe(true);
  });
});
