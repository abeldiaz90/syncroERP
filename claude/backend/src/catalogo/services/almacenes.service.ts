import {
  Injectable, ConflictException, InternalServerErrorException,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Almacen } from '../entities/almacen.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { CrearAlmacenDto } from '../dto/crear-almacen.dto';
import { esViolacionUnicidad } from '../../common/database/errores-sql';

@Injectable()
export class AlmacenesService {
  constructor(
    @InjectRepository(Almacen) private readonly almacenRepository: Repository<Almacen>,
    @InjectRepository(StockPorAlmacen) private readonly stockRepository: Repository<StockPorAlmacen>,
  ) {}

  private normalizarNombre(nombre: string): string {
    return nombre.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  async crearAlmacen(dto: CrearAlmacenDto, empresaId: string) {
    const nombre = this.normalizarNombre(dto.nombre);
    const existente = await this.almacenRepository
      .createQueryBuilder('a').where('a.empresaId = :empresaId', { empresaId })
      .andWhere('UPPER(LTRIM(RTRIM(a.nombre))) = :nombre', { nombre }).getOne();
    if (existente) throw new ConflictException('Ya existe un almacén con ese nombre.');
    const nuevo = this.almacenRepository.create({ ...dto, nombre: dto.nombre.trim().replace(/\s+/g, ' '), empresaId });
    try { return await this.almacenRepository.save(nuevo); }
    catch (error: any) {
      if (esViolacionUnicidad(error))
        throw new ConflictException('Ya existe un almacén con ese nombre.');
      throw new InternalServerErrorException('Error al crear el almacén.');
    }
  }

  async obtenerAlmacenes(empresaId: string, estado: 'ACTIVOS'|'INACTIVOS'|'TODOS' = 'ACTIVOS') {
    const qb = this.almacenRepository.createQueryBuilder('a')
      .where('a.empresaId = :empresaId', { empresaId }).orderBy('a.nombre', 'ASC');
    if (estado === 'ACTIVOS') qb.andWhere('a.activo=true');
    if (estado === 'INACTIVOS') qb.andWhere('a.activo=false');
    return qb.getMany();
  }

  async actualizarAlmacen(id: string, dto: Partial<CrearAlmacenDto>, empresaId: string) {
    const almacen = await this.almacenRepository.findOne({ where: { id, empresaId } });
    if (!almacen) throw new NotFoundException('Almacén no encontrado.');
    if (dto.nombre) {
      const nombreNormalizado = this.normalizarNombre(dto.nombre);
      const duplicado = await this.almacenRepository.createQueryBuilder('a')
        .where('a.empresaId = :empresaId', { empresaId }).andWhere('a.id <> :id', { id })
        .andWhere('UPPER(LTRIM(RTRIM(a.nombre))) = :nombre', { nombre: nombreNormalizado }).getOne();
      if (duplicado) throw new ConflictException('Ya existe otro almacén con ese nombre.');
      dto.nombre = dto.nombre.trim().replace(/\s+/g, ' ');
    }
    Object.assign(almacen, dto);
    return this.almacenRepository.save(almacen);
  }

  async toggleActivo(id: string, empresaId: string) {
    const almacen = await this.almacenRepository.findOne({ where: { id, empresaId } });
    if (!almacen) throw new NotFoundException('Almacén no encontrado.');
    if (almacen.activo) {
      const resumen = await this.stockRepository.createQueryBuilder('s')
        .select('COALESCE(SUM(s.cantidad), 0)', 'existencia')
        .where('s.empresaId = :empresaId', { empresaId }).andWhere('s.almacenId = :id', { id })
        .getRawOne<{ existencia: string }>();
      const existencia = Number(resumen?.existencia || 0);
      if (existencia > 0) throw new BadRequestException(
        `No se puede desactivar el almacén porque conserva ${existencia} unidades. Transfiere o ajusta el inventario primero.`,
      );
    }
    almacen.activo = !almacen.activo;
    return this.almacenRepository.save(almacen);
  }
}
