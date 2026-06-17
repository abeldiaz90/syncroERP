import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Impuesto } from '../entities/impuesto.entity';

@Injectable()
export class ImpuestoService {
  constructor(
    @InjectRepository(Impuesto)
    private readonly impuestoRepo: Repository<Impuesto>,
  ) {}

  findAll(empresaId: string) {
    return this.impuestoRepo.find({
      where: { empresaId, activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async create(nombre: string, porcentaje: number, empresaId: string) {
    const existe = await this.impuestoRepo.findOne({ where: { nombre, empresaId } });
    if (existe) throw new ConflictException('Ya existe un impuesto con ese nombre.');

    const impuesto = this.impuestoRepo.create({ nombre, porcentaje, empresaId });
    return this.impuestoRepo.save(impuesto);
  }

  async update(id: string, nombre: string, porcentaje: number, empresaId: string) {
    const impuesto = await this.impuestoRepo.findOne({ where: { id, empresaId } });
    if (!impuesto) throw new NotFoundException('Impuesto no encontrado.');

    const duplicado = await this.impuestoRepo.findOne({ where: { nombre, empresaId } });
    if (duplicado && duplicado.id !== id)
      throw new ConflictException('Ya existe otro impuesto con ese nombre.');

    impuesto.nombre = nombre;
    impuesto.porcentaje = porcentaje;
    return this.impuestoRepo.save(impuesto);
  }

  async toggleStatus(id: string, empresaId: string) {
    const impuesto = await this.impuestoRepo.findOne({ where: { id, empresaId } });
    if (!impuesto) throw new NotFoundException('Impuesto no encontrado.');

    impuesto.activo = !impuesto.activo;
    return this.impuestoRepo.save(impuesto);
  }
}