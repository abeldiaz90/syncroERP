// src/catalogo/services/estados.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Estado } from '../entities/estado.entity';
import { CrearEstadoDto } from '../dto/crear-estado.dto';
import { Pais } from '../entities/pais.entity';

@Injectable()
export class EstadosService {
  constructor(
    @InjectRepository(Estado) private repo: Repository<Estado>,
    @InjectRepository(Pais) private paises: Repository<Pais>,
  ) {}

  async findByPais(paisId?: string, activos = true) {
    const where: any = {};
    if (paisId) where.paisId = paisId;
    if (activos) where.activo = true;

    return this.repo.find({
      where,
      relations: ['pais'], // ← Esto carga el objeto país con su nombre
      order: { nombre: 'ASC' },
    });
  }

  async create(dto: CrearEstadoDto) {
    if (!dto.paisId) throw new BadRequestException('Selecciona el país.');
    const pais = await this.paises.findOne({ where: { id: dto.paisId, activo: true } });
    if (!pais) throw new BadRequestException('El país no existe o está inactivo.');
    const repetido = await this.repo
      .createQueryBuilder('e')
      .where('e.paisId = :paisId', { paisId: dto.paisId })
      .andWhere('UPPER(e.nombre) = UPPER(:nombre)', { nombre: dto.nombre.trim() })
      .getOne();
    if (repetido) throw new BadRequestException('La subdivisión ya existe en ese país.');
    const estado = this.repo.create({
      nombre: dto.nombre.trim(),
      paisId: dto.paisId,
      esOficial: false,
    });
    return this.repo.save(estado);
  }

  async update(id: string, dto: Partial<CrearEstadoDto>) {
    const estado = await this.repo.findOne({ where: { id } });
    if (!estado) throw new NotFoundException('Estado no encontrado');
    if (estado.esOficial)
      throw new BadRequestException('Las subdivisiones oficiales no se pueden modificar.');
    if (dto.nombre) estado.nombre = dto.nombre;
    if (dto.paisId !== undefined) {
      estado.paisId = dto.paisId || null;
    }
    return this.repo.save(estado);
  }

  async toggle(id: string) {
    const estado = await this.repo.findOne({ where: { id } });
    if (!estado) throw new NotFoundException('Estado no encontrado');
    if (estado.esOficial)
      throw new BadRequestException('Las subdivisiones oficiales siempre permanecen activas.');
    estado.activo = !estado.activo;
    return this.repo.save(estado);
  }
}
