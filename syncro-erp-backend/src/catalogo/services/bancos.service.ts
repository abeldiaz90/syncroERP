import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Banco } from '../entities/banco.entity';
import { CrearBancoDto } from '../dto/crear-banco.dto';

@Injectable()
export class BancosService {
  constructor(@InjectRepository(Banco) private repo: Repository<Banco>) {}

  findAll(activos = true) {
    const where: any = {};
    if (activos) where.activo = true;
    return this.repo.find({ where, order: { nombre: 'ASC' } });
  }

  create(dto: CrearBancoDto) {
    const banco = this.repo.create(dto);
    return this.repo.save(banco);
  }

  async update(id: string, dto: Partial<CrearBancoDto>) {
    const banco = await this.repo.findOne({ where: { id } });
    if (!banco) throw new NotFoundException('Banco no encontrado');
    Object.assign(banco, dto);
    return this.repo.save(banco);
  }

  async toggle(id: string) {
    const banco = await this.repo.findOne({ where: { id } });
    if (!banco) throw new NotFoundException('Banco no encontrado');
    banco.activo = !banco.activo;
    return this.repo.save(banco);
  }
}