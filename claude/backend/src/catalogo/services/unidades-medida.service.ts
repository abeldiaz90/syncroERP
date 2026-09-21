// catalogo/services/unidades-medida.service.ts
import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnidadMedida } from '../entities/unidad-medida.entity';
import { CrearUnidadMedidaDto } from '../dto/crear-unidad-medida.dto';
import { UNIDADES_ESTANDAR } from '../data/unidades-estandar';
import { esViolacionUnicidad } from '../../common/database/errores-sql';

@Injectable()
export class UnidadesMedidaService {
  constructor(
    @InjectRepository(UnidadMedida)
    private readonly unidadRepository: Repository<UnidadMedida>,
  ) {}

  async crear(dto: CrearUnidadMedidaDto, empresaId: string) {
    const nueva = this.unidadRepository.create({
      ...dto,
      empresaId,
      activo: true,
    });
    try {
      return await this.unidadRepository.save(nueva);
    } catch (error: any) {
      if (
        esViolacionUnicidad(error)
      ) {
        throw new ConflictException('Ya existe una unidad con este nombre.');
      }
      throw new InternalServerErrorException(
        'Error al crear la unidad de medida.',
      );
    }
  }

  async obtenerTodas(empresaId: string, soloActivas = false) {
    const where: any = { empresaId };
    if (soloActivas) where.activo = true;
    return this.unidadRepository.find({ where, order: { nombre: 'ASC' } });
  }

  async actualizar(
    id: string,
    dto: Partial<CrearUnidadMedidaDto>,
    empresaId: string,
  ) {
    const unidad = await this.unidadRepository.findOne({
      where: { id, empresaId },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada.');
    Object.assign(unidad, dto);
    try {
      return await this.unidadRepository.save(unidad);
    } catch (error: any) {
      if (
        esViolacionUnicidad(error)
      ) {
        throw new ConflictException('Ya existe otra unidad con este nombre.');
      }
      throw new InternalServerErrorException('Error al actualizar la unidad.');
    }
  }

  async cambiarEstado(id: string, empresaId: string) {
    const unidad = await this.unidadRepository.findOne({
      where: { id, empresaId },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada.');
    unidad.activo = !unidad.activo;
    return this.unidadRepository.save(unidad);
  }

  /**
   * Precarga el catálogo estándar de unidades. IDEMPOTENTE: no duplica las
   * que ya existan (por nombre). Se usa desde el setup inicial o el botón
   * "Cargar unidades comunes".
   */
  async precargarEstandar(empresaId: string) {
    const existentes = await this.unidadRepository.find({
      where: { empresaId },
    });
    const nombresExistentes = new Set(
      existentes.map((u) => u.nombre.toLowerCase()),
    );

    const aCrear = UNIDADES_ESTANDAR.filter(
      (u) => !nombresExistentes.has(u.nombre.toLowerCase()),
    ).map((u) =>
      this.unidadRepository.create({ ...u, empresaId, activo: true }),
    );

    if (aCrear.length > 0) {
      await this.unidadRepository.save(aCrear);
    }

    return {
      ok: true,
      creadas: aCrear.length,
      yaExistian: UNIDADES_ESTANDAR.length - aCrear.length,
    };
  }
}
