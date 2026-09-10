import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Departamento } from './../entities/departamento.entity';
import { CrearDepartamentoDto } from '../dto/crear-departamento.dto';

@Injectable()
export class DepartamentosService {
  constructor(
    @InjectRepository(Departamento)
    private readonly repo: Repository<Departamento>,
  ) {}

  async create(dto: CrearDepartamentoDto, empresaId: string) {
    const nombre = dto.nombre.trim();
    const duplicado = await this.repo.createQueryBuilder('departamento')
      .where('departamento.empresaId = :empresaId', { empresaId })
      .andWhere('LOWER(departamento.nombre) = LOWER(:nombre)', { nombre })
      .getOne();
    if (duplicado) throw new ConflictException(`Ya existe el departamento ${nombre}.`);
    const departamento = this.repo.create({ ...dto, nombre, empresaId });
    return this.repo.save(departamento);
  }

  findAll(empresaId: string) {
    return this.repo.find({
      where: { empresaId, activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async update(
    id: string,
    dto: Partial<CrearDepartamentoDto>,
    empresaId: string,
  ) {
    const departamento = await this.repo.findOne({ where: { id, empresaId } });
    if (!departamento)
      throw new NotFoundException('Departamento no encontrado');
    Object.assign(departamento, dto);
    return this.repo.save(departamento);
  }

  async toggle(id: string, empresaId: string) {
    const departamento = await this.repo.findOne({ where: { id, empresaId } });
    if (!departamento)
      throw new NotFoundException('Departamento no encontrado');
    departamento.activo = !departamento.activo;
    return this.repo.save(departamento);
  }
}
