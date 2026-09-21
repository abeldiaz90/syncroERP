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

  /** Lo que una lista puede declarar además de su nombre. */
  private reglaDe(dto: {
    modo?: 'MANUAL' | 'MARGEN';
    margenPorcentaje?: number;
    redondeo?: number;
  }) {
    const regla: Record<string, unknown> = {};
    if (dto.modo !== undefined) regla.modo = dto.modo;
    if (dto.margenPorcentaje !== undefined)
      regla.margenPorcentaje = Number(dto.margenPorcentaje);
    if (dto.redondeo !== undefined) regla.redondeo = Number(dto.redondeo);
    /*
     * Una lista en MARGEN con margen cero vendería exactamente al costo. Casi
     * siempre es que alguien cambió el modo y se le olvidó el margen, y el
     * resultado no se nota hasta cerrar el mes sin utilidad.
     */
    if (
      regla.modo === 'MARGEN' &&
      !(Number(regla.margenPorcentaje ?? 0) > 0)
    ) {
      throw new BadRequestException(
        'Una lista que calcula el precio desde el costo necesita un margen mayor que cero: ' +
          'con margen cero venderías exactamente a lo que te costó.',
      );
    }
    return regla;
  }

  async crearLista(
    dto: {
      nombre: string;
      esPorDefecto: boolean;
      modo?: 'MANUAL' | 'MARGEN';
      margenPorcentaje?: number;
      redondeo?: number;
    },
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
      return repo.save(
        repo.create({ nombre, empresaId, esPorDefecto, ...this.reglaDe(dto) }),
      );
    });
  }

  async actualizarLista(
    id: string,
    dto: {
      nombre?: string;
      esPorDefecto?: boolean;
      modo?: 'MANUAL' | 'MARGEN';
      margenPorcentaje?: number;
      redondeo?: number;
    },
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
    /*
     * La regla se aplica sobre la entidad ya cargada para que la validación de
     * «MARGEN sin margen» vea también lo que la lista ya tenía: cambiar sólo el
     * modo, sin tocar el margen, tiene que seguir siendo válido si el margen ya
     * estaba puesto.
     */
    Object.assign(
      lista,
      this.reglaDe({
        modo: dto.modo ?? lista.modo,
        margenPorcentaje: dto.margenPorcentaje ?? lista.margenPorcentaje,
        redondeo: dto.redondeo ?? lista.redondeo,
      }),
    );

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
