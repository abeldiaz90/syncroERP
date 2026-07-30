// src/clientes/services/clientes.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CrearClienteDto } from './crear-cliente.dto';
import { Pais } from '../catalogo/entities/pais.entity';
import { Estado } from '../catalogo/entities/estado.entity';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
    @InjectRepository(Pais) private readonly paisRepo: Repository<Pais>,
    @InjectRepository(Estado) private readonly estadoRepo: Repository<Estado>,
  ) {}

  async crear(dto: CrearClienteDto, empresaId: string) {
    await this.validarUbicacion(dto);
    const cliente = this.clienteRepo.create({ ...dto, empresaId });
    return this.clienteRepo.save(cliente);
  }

  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const where: any = { empresaId };
    if (soloActivos) where.activo = true;

    const query = this.clienteRepo.createQueryBuilder('c').where(where);

    if (filtro) {
      query.andWhere(
        '(c.nombre LIKE :filtro OR c.email LIKE :filtro OR c.telefono LIKE :filtro OR c.rfc LIKE :filtro)',
        { filtro: `%${filtro}%` },
      );
    }

    return query.orderBy('c.nombre', 'ASC').getMany();
  }

  async obtenerPorId(id: string, empresaId: string) {
    const cliente = await this.clienteRepo.findOne({
      where: { id, empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');
    return cliente;
  }

  async actualizar(
    id: string,
    dto: Partial<CrearClienteDto>,
    empresaId: string,
  ) {
    const cliente = await this.clienteRepo.findOne({
      where: { id, empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    await this.validarUbicacion(dto);
    Object.assign(cliente, dto);
    return this.clienteRepo.save(cliente);
  }

  async toggleActivo(id: string, empresaId: string) {
    const cliente = await this.clienteRepo.findOne({
      where: { id, empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    cliente.activo = !cliente.activo;
    return this.clienteRepo.save(cliente);
  }

  private async validarUbicacion(dto: Partial<CrearClienteDto>) {
    if (dto.estadoId && !dto.paisId)
      throw new BadRequestException('Selecciona el país del estado.');
    if (!dto.paisId) return;
    const pais = await this.paisRepo.findOne({
      where: { id: dto.paisId, activo: true },
    });
    if (!pais) throw new BadRequestException('El país no existe o está inactivo.');
    if (dto.estadoId) {
      const estado = await this.estadoRepo.findOne({
        where: { id: dto.estadoId, paisId: dto.paisId, activo: true },
      });
      if (!estado)
        throw new BadRequestException(
          'El estado no pertenece al país seleccionado.',
        );
    }
  }
}
