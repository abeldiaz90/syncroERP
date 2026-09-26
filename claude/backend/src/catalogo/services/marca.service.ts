import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Marca } from '../entities/marca.entity';
import { esViolacionUnicidad } from '../../common/database/errores-sql';

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
      if (esViolacionUnicidad(error)) {
        throw new ConflictException('Ya existe una marca con ese nombre.');
      }
      /*
       * Cualquier otro error se propaga tal cual. Convertirlo aquí en un 500
       * genérico borraba la causa —una columna que se quedó corta, una llave
       * foránea— y dejaba al filtro global sin nada que traducir.
       */
      throw error;
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
      if (esViolacionUnicidad(error)) {
        throw new ConflictException('Ya existe otra marca con ese nombre.');
      }
      // Mismo criterio que en `create`: lo demás se propaga con su causa.
      throw error;
    }
  }

  async toggleStatus(id: string, empresaId: string) {
    const marca = await this.marcaRepo.findOne({ where: { id, empresaId } });
    if (!marca) throw new NotFoundException('Marca no encontrada.');

    marca.activo = !marca.activo;
    return this.marcaRepo.save(marca);
  }
}
