// src/catalogo/services/estados.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Estado } from '../entities/estado.entity';
import { CrearEstadoDto } from '../dto/crear-estado.dto';

@Injectable()
export class EstadosService {
  constructor(@InjectRepository(Estado) private repo: Repository<Estado>) {}

  async findByPais(paisId?: string, activos = true) {
    const where: any = {};
    if (paisId) where.paisId = paisId;
    if (activos) where.activo = true;

    return this.repo.find({
      where,
      relations: ['pais'],   // ← Esto carga el objeto país con su nombre
      order: { nombre: 'ASC' },
    });
  }

  create(dto: CrearEstadoDto) {
    const estado = this.repo.create({
      nombre: dto.nombre,
      paisId: dto.paisId || null,
    });
    return this.repo.save(estado);
  }

  async update(id: string, dto: Partial<CrearEstadoDto>) {
    const estado = await this.repo.findOne({ where: { id } });
    if (!estado) throw new NotFoundException('Estado no encontrado');
    if (dto.nombre) estado.nombre = dto.nombre;
    if (dto.paisId !== undefined) {
      estado.paisId = dto.paisId || null;
    }
    return this.repo.save(estado);
  }

  async toggle(id: string) {
    const estado = await this.repo.findOne({ where: { id } });
    if (!estado) throw new NotFoundException('Estado no encontrado');
    estado.activo = !estado.activo;
    return this.repo.save(estado);
  }
}