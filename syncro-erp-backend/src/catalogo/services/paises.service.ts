import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(dto: CrearPaisDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const duplicado = await this.repo.findOne({ where: { codigo } });
    if (duplicado) throw new BadRequestException('Ya existe un país con ese código.');
    const pais = this.repo.create(dto);
    pais.codigo = codigo;
    pais.esOficial = false;
    return this.repo.save(pais);
  }

  async update(id: string, dto: Partial<CrearPaisDto>) {
    const pais = await this.repo.findOne({ where: { id } });
    if (!pais) throw new NotFoundException('País no encontrado');
    if (pais.esOficial)
      throw new BadRequestException('Los países oficiales no se pueden modificar.');
    Object.assign(pais, dto);
    return this.repo.save(pais);
  }

  async toggle(id: string) {
    const pais = await this.repo.findOne({ where: { id } });
    if (!pais) throw new NotFoundException('País no encontrado');
    if (pais.esOficial)
      throw new BadRequestException('Los países oficiales siempre permanecen activos.');
    pais.activo = !pais.activo;
    return this.repo.save(pais);
  }
}
