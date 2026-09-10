// src/proveedores/services/proveedores.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Proveedor } from './entities/proveedor.entity';
import { CrearProveedorDto } from './crear-proveedor.dto';
import { Pais } from '../catalogo/entities/pais.entity';
import { Estado } from '../catalogo/entities/estado.entity';
import { ResolverHomologacionDto } from './resolver-homologacion.dto';
import { esRolAdministrador, normalizarRol } from '../iam/utils/roles.util';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor)
    private readonly proveedorRepo: Repository<Proveedor>,
    @InjectRepository(Pais) private readonly paisRepo: Repository<Pais>,
    @InjectRepository(Estado) private readonly estadoRepo: Repository<Estado>,
  ) {}

  async crear(dto: CrearProveedorDto, empresaId: string) {
    await this.validar(dto, empresaId);
    const proveedor = this.proveedorRepo.create({
      ...dto,
      empresaId,
      estadoHomologacion: 'EN_EVALUACION',
    } as Partial<Proveedor>);
    return this.proveedorRepo.save(proveedor);
  }

  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const where: any = { empresaId };
    if (soloActivos) where.activo = true;

    const query = this.proveedorRepo.createQueryBuilder('p').where(where);

    if (filtro) {
      query.andWhere(
        '(p.nombre LIKE :filtro OR p.rfc LIKE :filtro OR p.email LIKE :filtro OR p.telefono LIKE :filtro OR p.razonSocial LIKE :filtro)',
        { filtro: `%${filtro}%` },
      );
    }

    return query.orderBy('p.nombre', 'ASC').getMany();
  }

  async actualizar(
    id: string,
    dto: Partial<CrearProveedorDto>,
    empresaId: string,
  ) {
    const proveedor = await this.proveedorRepo.findOne({
      where: { id, empresaId },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');

    await this.validar({ ...proveedor, ...dto }, empresaId, id);
    const camposCriticos: Array<keyof CrearProveedorDto> = [
      'rfc',
      'razonSocial',
      'tipoPersona',
      'bancoId',
      'numeroCuenta',
      'clabe',
      'limiteCredito',
      'diasCredito',
      'metodoPago',
      'formaPagoId',
    ];
    const cambiaDatoCritico = camposCriticos.some(
      (campo) =>
        dto[campo] !== undefined &&
        String(dto[campo] ?? '') !== String((proveedor as any)[campo] ?? ''),
    );
    Object.assign(proveedor, dto);
    if (cambiaDatoCritico) {
      proveedor.estadoHomologacion = 'EN_EVALUACION';
      proveedor.homologacionResueltaPorId = null;
      proveedor.fechaResolucionHomologacion = null;
      proveedor.comentarioHomologacion = null;
    }
    return this.proveedorRepo.save(proveedor);
  }

  async obtenerPorId(id: string, empresaId: string) {
    const proveedor = await this.proveedorRepo.findOne({
      where: { id, empresaId },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');
    return proveedor;
  }

  async resolverHomologacion(
    id: string,
    dto: ResolverHomologacionDto,
    empresaId: string,
    usuarioId: string,
    rol: string,
  ) {
    const rolNormalizado = normalizarRol(rol);
    if (
      !esRolAdministrador(rol) &&
      !['COMPRAS', 'COMPRADOR', 'FINANZAS', 'GERENCIA', 'DIRECCION'].includes(
        rolNormalizado,
      )
    ) {
      throw new ForbiddenException(
        'Sólo Compras, Finanzas, Gerencia o un administrador pueden homologar proveedores.',
      );
    }
    const proveedor = await this.obtenerPorId(id, empresaId);
    const comentario = dto.comentario?.trim() || null;
    if (dto.estado !== 'APROBADO' && !comentario) {
      throw new BadRequestException(
        'Una homologación condicionada o bloqueada requiere una justificación.',
      );
    }
    proveedor.estadoHomologacion = dto.estado;
    proveedor.nivelRiesgo = dto.nivelRiesgo;
    proveedor.homologacionResueltaPorId = usuarioId;
    proveedor.fechaResolucionHomologacion = new Date();
    proveedor.comentarioHomologacion = comentario;
    return this.proveedorRepo.save(proveedor);
  }

  private async validar(dto: Partial<CrearProveedorDto>, empresaId: string, excluirId?: string) {
    const rfc = String(dto.rfc ?? '').trim().toUpperCase();
    if (rfc) {
      const longitud = (dto.tipoPersona ?? 'MORAL') === 'FISICA' ? 13 : 12;
      if (rfc.length !== longitud || !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc))
        throw new BadRequestException(`El RFC debe ser válido y contener ${longitud} caracteres.`);
      const qb = this.proveedorRepo.createQueryBuilder('p').where('p.empresaId=:empresaId', { empresaId }).andWhere('UPPER(p.rfc)=:rfc', { rfc });
      if (excluirId) qb.andWhere('p.id<>:excluirId', { excluirId });
      if (await qb.getOne()) throw new BadRequestException('Ya existe otro proveedor con ese RFC.');
    }
    if (dto.clabe && !/^\d{18}$/.test(dto.clabe)) throw new BadRequestException('La CLABE debe contener exactamente 18 dígitos.');
    if (dto.estadoId && !dto.paisId) throw new BadRequestException('Selecciona el país del estado.');
    if (dto.paisId) {
      const pais = await this.paisRepo.findOne({ where: { id: dto.paisId, activo: true } });
      if (!pais) throw new BadRequestException('El país no existe o está inactivo.');
      if (dto.estadoId) {
        const estado = await this.estadoRepo.findOne({ where: { id: dto.estadoId, paisId: dto.paisId, activo: true } });
        if (!estado) throw new BadRequestException('El estado no pertenece al país seleccionado.');
      }
    }
    const limite = Number(dto.limiteCredito ?? 0), dias = Number(dto.diasCredito ?? 0);
    if ((limite > 0 && dias <= 0) || (dias > 0 && limite <= 0))
      throw new BadRequestException('El límite y los días de crédito deben configurarse juntos.');
  }

  async toggleActivo(id: string, empresaId: string) {
    const proveedor = await this.proveedorRepo.findOne({
      where: { id, empresaId },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');

    proveedor.activo = !proveedor.activo;
    return this.proveedorRepo.save(proveedor);
  }
}
