// src/clientes/services/clientes.service.ts
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CrearClienteDto } from './crear-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
  ) {}

  async crear(dto: CrearClienteDto, empresaId: string) {
    const cliente = this.clienteRepo.create({ ...dto, empresaId });
    return this.clienteRepo.save(cliente);
  }

  async obtenerTodos(
    empresaId: string,
    filtro?: string,
    soloActivos = true,
  ) {
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
    const cliente = await this.clienteRepo.findOne({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');
    return cliente;
  }

  async actualizar(id: string, dto: Partial<CrearClienteDto>, empresaId: string) {
    const cliente = await this.clienteRepo.findOne({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    Object.assign(cliente, dto);
    return this.clienteRepo.save(cliente);
  }

  async toggleActivo(id: string, empresaId: string) {
    const cliente = await this.clienteRepo.findOne({ where: { id, empresaId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');

    cliente.activo = !cliente.activo;
    return this.clienteRepo.save(cliente);
  }
}