import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pais } from '../entities/pais.entity';
import { CrearPaisDto } from '../dto/crear-pais.dto';

@Injectable()
export class PaisesService {
  constructor(@InjectRepository(Pais) private repo: Repository<Pais>) {}

  findAll(activos = true) {
    const where: any = {};
    if (activos) where.activo = true;
    return this.repo.find({ where, order: { nombre: 'ASC' } });
  }

  create(dto: CrearPaisDto) {
    const pais = this.repo.create(dto);
    return this.repo.save(pais);
  }

  async update(id: string, dto: Partial<CrearPaisDto>) {
    const pais = await this.repo.findOne({ where: { id } });
    if (!pais) throw new NotFoundException('País no encontrado');
    Object.assign(pais, dto);
    return this.repo.save(pais);
  }

  async toggle(id: string) {
    const pais = await this.repo.findOne({ where: { id } });
    if (!pais) throw new NotFoundException('País no encontrado');
    pais.activo = !pais.activo;
    return this.repo.save(pais);
  }
}