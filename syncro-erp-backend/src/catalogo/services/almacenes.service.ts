import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Almacen } from '../entities/almacen.entity';
import { CrearAlmacenDto } from '../dto/crear-almacen.dto';

@Injectable()
export class AlmacenesService {
  constructor(
    @InjectRepository(Almacen)
    private readonly almacenRepository: Repository<Almacen>,
  ) {}

  async crearAlmacen(dto: CrearAlmacenDto, empresaId: string) {
    const nuevo = this.almacenRepository.create({ ...dto, empresaId });
    try {
      return await this.almacenRepository.save(nuevo);
    } catch (error: any) {
      if (error.number === 2627 || error.number === 2601 || error.code === '23505') {
        throw new ConflictException('Ya existe un almacén con ese nombre.');
      }
      throw new InternalServerErrorException('Error al crear el almacén.');
    }
  }

  async obtenerAlmacenes(empresaId: string) {
    return await this.almacenRepository.find({
      where: { empresaId, activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async actualizarAlmacen(id: string, dto: Partial<CrearAlmacenDto>, empresaId: string) {
    const almacen = await this.almacenRepository.findOne({ where: { id, empresaId } });
    if (!almacen) throw new NotFoundException('Almacén no encontrado.');

    Object.assign(almacen, dto);
    try {
      return await this.almacenRepository.save(almacen);
    } catch (error: any) {
      if (error.number === 2627 || error.number === 2601 || error.code === '23505') {
        throw new ConflictException('Ya existe otro almacén con ese nombre.');
      }
      throw new InternalServerErrorException('Error al actualizar el almacén.');
    }
  }

  async toggleActivo(id: string, empresaId: string) {
    const almacen = await this.almacenRepository.findOne({ where: { id, empresaId } });
    if (!almacen) throw new NotFoundException('Almacén no encontrado.');

    almacen.activo = !almacen.activo;
    return this.almacenRepository.save(almacen);
  }
}