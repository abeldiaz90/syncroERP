import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ListaPrecio } from '../entities/lista-precio.entity';

@Injectable()
export class ListasPrecioService {
  constructor(
    @InjectRepository(ListaPrecio)
    private readonly listaPrecioRepository: Repository<ListaPrecio>,
    private readonly dataSource: DataSource,
  ) {}

  async obtenerListas(empresaId: string) {
    return this.listaPrecioRepository.find({
      where: { empresaId },
      order: { esPorDefecto: 'DESC', nombre: 'ASC' },
    });
  }

  async crearLista(
    dto: { nombre: string; esPorDefecto: boolean },
    empresaId: string,
  ) {
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ListaPrecio);
      const duplicada = await repo
        .createQueryBuilder('lista')
        .where('lista.empresaId = :empresaId', { empresaId })
        .andWhere('UPPER(lista.nombre) = UPPER(:nombre)', { nombre })
        .getOne();
      if (duplicada) {
        throw new ConflictException('Ya existe una lista con ese nombre.');
      }
      const total = await repo.count({ where: { empresaId } });
      const esPorDefecto = total === 0 || dto.esPorDefecto === true;
      if (esPorDefecto) {
        await repo.update({ empresaId }, { esPorDefecto: false });
      }
      return repo.save(repo.create({ nombre, empresaId, esPorDefecto }));
    });
  }

  async actualizarLista(
    id: string,
    dto: { nombre?: string; esPorDefecto?: boolean },
    empresaId: string,
  ) {
    const lista = await this.listaPrecioRepository.findOne({
      where: { id, empresaId },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    if (dto.esPorDefecto === false && lista.esPorDefecto) {
      throw new BadRequestException(
        'No puedes dejar la empresa sin lista predeterminada. Marca primero otra lista como predeterminada.',
      );
    }
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
      const duplicada = await this.listaPrecioRepository
        .createQueryBuilder('otra')
        .where('otra.empresaId = :empresaId', { empresaId })
        .andWhere('otra.id <> :id', { id })
        .andWhere('UPPER(otra.nombre) = UPPER(:nombre)', { nombre })
        .getOne();
      if (duplicada) {
        throw new ConflictException('Ya existe una lista con ese nombre.');
      }
      lista.nombre = nombre;
    }
    if (dto.esPorDefecto) {
      await this.listaPrecioRepository.update(
        { empresaId },
        { esPorDefecto: false },
      );
      lista.esPorDefecto = true;
    }
    return this.listaPrecioRepository.save(lista);
  }

  async eliminarLista(id: string, empresaId: string) {
    const lista = await this.listaPrecioRepository.findOne({
      where: { id, empresaId },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ListaPrecio);
      await repo.remove(lista);
      if (lista.esPorDefecto) {
        const siguiente = await repo.findOne({
          where: { empresaId },
          order: { nombre: 'ASC' },
        });
        if (siguiente) {
          siguiente.esPorDefecto = true;
          await repo.save(siguiente);
        }
      }
    });
    return { mensaje: 'Lista eliminada correctamente' };
  }
}
