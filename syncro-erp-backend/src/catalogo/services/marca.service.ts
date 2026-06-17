import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Marca } from '../entities/marca.entity';

@Injectable()
export class MarcaService {
  constructor(
    @InjectRepository(Marca)
    private readonly marcaRepo: Repository<Marca>,
  ) {}

  async findAll(empresaId: string) {
    return this.marcaRepo.find({
      where: { empresaId },
      order: { nombre: 'ASC' },
    });
  }

  async create(nombre: string, empresaId: string) {
    const nombreLimpio = nombre.trim();
    const marca = this.marcaRepo.create({ nombre: nombreLimpio, empresaId });
    try {
      return await this.marcaRepo.save(marca);
    } catch (error: any) {
      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictException('Ya existe una marca con ese nombre.');
      }
      throw new InternalServerErrorException('Error al crear la marca.');
    }
  }

  async update(id: string, nombre: string, empresaId: string) {
    const nombreLimpio = nombre.trim();
    const marca = await this.marcaRepo.findOne({ where: { id, empresaId } });
    if (!marca) throw new NotFoundException('Marca no encontrada.');

    marca.nombre = nombreLimpio;
    try {
      return await this.marcaRepo.save(marca);
    } catch (error: any) {
      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictException('Ya existe otra marca con ese nombre.');
      }
      throw new InternalServerErrorException('Error al actualizar la marca.');
    }
  }

  async toggleStatus(id: string, empresaId: string) {
    const marca = await this.marcaRepo.findOne({ where: { id, empresaId } });
    if (!marca) throw new NotFoundException('Marca no encontrada.');

    marca.activo = !marca.activo;
    return this.marcaRepo.save(marca);
  }
}