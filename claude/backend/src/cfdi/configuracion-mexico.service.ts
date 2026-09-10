import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Empresa } from '../iam/entities/empresa.entity';
import { CuentaContable } from '../finanzas/entities/cuenta-contable.entity';
import { Impuesto } from '../catalogo/entities/impuesto.entity';
import { CuentasContablesService } from '../finanzas/services/cuentas-contables.service';
import { ImpuestoService } from '../catalogo/services/impuesto.service';
import { ConfiguracionFiscal } from './configuracion-fiscal.entity';
import { ConfiguracionMexicoDto } from './configuracion-mexico.dto';
import {
  PERFILES_IMPUESTOS_MX,
  REGIMENES_FISCALES_MX,
} from './catalogos-fiscales-mx';

@Injectable()
export class ConfiguracionMexicoService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    @InjectRepository(Impuesto)
    private readonly impuestoRepo: Repository<Impuesto>,
    @InjectRepository(ConfiguracionFiscal)
    private readonly configFiscalRepo: Repository<ConfiguracionFiscal>,
    private readonly cuentasService: CuentasContablesService,
    private readonly impuestoService: ImpuestoService,
  ) {}

  catalogos() {
    return {
      versionCFDI: '4.0',
      ejercicioReferencia: 2026,
      regimenes: REGIMENES_FISCALES_MX,
      perfilesImpuestos: PERFILES_IMPUESTOS_MX,
      aviso:
        'Las sugerencias ayudan a configurar el ERP, pero el régimen y tratamiento fiscal deben coincidir con la Constancia de Situación Fiscal y revisarse con un contador.',
      fuentes: [
        {
          nombre: 'Requisitos de las facturas',
          url: 'https://www.sat.gob.mx/minisitio/Factura/solicita_requisitos.htm',
        },
        {
          nombre: 'Anexo 24 de la RMF 2026',
          url: 'https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo_24_RMF2026-13012026.pdf',
        },
      ],
    };
  }

  async diagnostico(empresaId: string) {
    const [empresa, configFiscal, cuentas, impuestos] = await Promise.all([
      this.empresaRepo.findOne({ where: { id: empresaId } }),
      this.configFiscalRepo.findOne({ where: { empresaId } }),
      this.cuentaRepo.find({ where: { empresaId, activo: true } }),
      this.impuestoRepo.find({ where: { empresaId, activo: true } }),
    ]);
    if (!empresa) throw new NotFoundException('Empresa no encontrada.');

    const roles = new Set(
      cuentas.filter((c) => c.rolSistema).map((c) => c.rolSistema),
    );
    const rolesMinimos = [
      'CAJA',
      'BANCOS',
      'CLIENTES_CXC',
      'INVENTARIO',
      'IVA_ACREDITABLE_PAGADO',
      'IVA_ACREDITABLE_PENDIENTE',
      'IVA_TRASLADADO_COBRADO',
      'IVA_TRASLADADO_NO_COBRADO',
      'PROVEEDORES',
      'VENTAS',
      'COSTO_VENTAS',
    ];
    const rolesFaltantes = rolesMinimos.filter((rol) => !roles.has(rol as any));
    const impuestosConfigurados = impuestos.map((i) => i.nombre);

    const identidadCompleta = Boolean(
      empresa.rfc &&
      empresa.regimenFiscal &&
      empresa.codigoPostal &&
      empresa.tipoPersonaFiscal,
    );
    const catalogosCompletos =
      rolesFaltantes.length === 0 && impuestos.length > 0;

    return {
      configuracionBaseCompleta: identidadCompleta && catalogosCompletos,
      datosPrecarga: {
        nombreComercial: empresa.nombreComercial,
        razonSocial: configFiscal?.razonSocial || empresa.nombreComercial,
        rfc: empresa.rfc || configFiscal?.rfc || '',
        regimenFiscal: empresa.regimenFiscal || configFiscal?.regimenFiscal || '',
        codigoPostal: empresa.codigoPostal || configFiscal?.codigoPostalExpedicion || '',
        tipoPersona:
          empresa.tipoPersonaFiscal ||
          ((empresa.rfc || configFiscal?.rfc || '').length === 13 ? 'FISICA' : 'MORAL'),
        giro: empresa.giro || '',
        perfilImpuestos: empresa.perfilImpuestos || 'GENERAL',
      },
      identidadFiscal: {
        completa: identidadCompleta,
        rfc: empresa.rfc,
        regimenFiscal: empresa.regimenFiscal,
        codigoPostal: empresa.codigoPostal,
        tipoPersona: empresa.tipoPersonaFiscal,
      },
      contabilidad: {
        completa: rolesFaltantes.length === 0,
        rolesConfigurados: roles.size,
        rolesFaltantes,
      },
      impuestos: {
        completa: impuestos.length > 0,
        configurados: impuestosConfigurados,
      },
      facturacion: {
        datosEmisorCompletos: Boolean(
          configFiscal?.rfc &&
          configFiscal?.razonSocial &&
          configFiscal?.regimenFiscal &&
          configFiscal?.codigoPostalExpedicion,
        ),
        pacConfigurado: Boolean(
          configFiscal?.facturamaUser && configFiscal?.facturamaPassword,
        ),
        mensaje: configFiscal?.facturamaUser
          ? 'Datos del PAC configurados.'
          : 'La configuración base está lista; falta conectar el PAC para timbrar.',
      },
    };
  }

  async aplicar(empresaId: string, dto: ConfiguracionMexicoDto) {
    const empresa = await this.empresaRepo.findOne({
      where: { id: empresaId },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada.');

    const rfc = dto.rfc.toUpperCase().trim();
    const longitudEsperada = dto.tipoPersona === 'FISICA' ? 13 : 12;
    if (rfc.length !== longitudEsperada) {
      throw new BadRequestException(
        `El RFC de una persona ${dto.tipoPersona === 'FISICA' ? 'física' : 'moral'} debe tener ${longitudEsperada} caracteres.`,
      );
    }

    const regimen = REGIMENES_FISCALES_MX.find(
      (r) => r.clave === dto.regimenFiscal,
    );
    if (!regimen || !regimen.personas.includes(dto.tipoPersona)) {
      throw new BadRequestException(
        'El régimen fiscal seleccionado no corresponde al tipo de persona.',
      );
    }
    if (!dto.confirmaRevisionConContador) {
      throw new BadRequestException(
        'Confirma que los datos se cotejaron con la Constancia de Situación Fiscal.',
      );
    }
    if (dto.perfilImpuestos === 'FRONTERA' && !dto.confirmaEstimuloFronterizo) {
      throw new BadRequestException(
        'El IVA 8% sólo puede habilitarse cuando confirmas que cumples los requisitos del estímulo fronterizo.',
      );
    }

    empresa.rfc = rfc;
    empresa.regimenFiscal = dto.regimenFiscal;
    empresa.codigoPostal = dto.codigoPostal;
    empresa.tipoPersonaFiscal = dto.tipoPersona;
    empresa.perfilImpuestos = dto.perfilImpuestos;
    if (dto.giro?.trim()) empresa.giro = dto.giro.trim();
    await this.empresaRepo.save(empresa);

    let configFiscal = await this.configFiscalRepo.findOne({
      where: { empresaId },
    });
    if (!configFiscal) {
      configFiscal = this.configFiscalRepo.create({
        empresaId,
        rfc,
        razonSocial: dto.razonSocial.trim(),
        regimenFiscal: dto.regimenFiscal,
        codigoPostalExpedicion: dto.codigoPostal,
        facturamaUser: null,
        facturamaPassword: null,
        sandbox: true,
        serie: 'A',
        folioActual: 1,
        activo: true,
      });
    } else {
      configFiscal.rfc = rfc;
      configFiscal.razonSocial = dto.razonSocial.trim();
      configFiscal.regimenFiscal = dto.regimenFiscal;
      configFiscal.codigoPostalExpedicion = dto.codigoPostal;
    }
    await this.configFiscalRepo.save(configFiscal);

    const [cuentas, impuestos] = await Promise.all([
      this.cuentasService.precargarPlanEstandar(empresaId),
      this.impuestoService.precargarEstandar(
        empresaId,
        dto.perfilImpuestos === 'FRONTERA',
      ),
    ]);

    return {
      ok: true,
      cuentas,
      impuestos,
      diagnostico: await this.diagnostico(empresaId),
    };
  }
}
