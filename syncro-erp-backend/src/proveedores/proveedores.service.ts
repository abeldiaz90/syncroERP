// src/proveedores/services/proveedores.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Proveedor } from './entities/proveedor.entity';
import { CrearProveedorDto } from './crear-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor)
    private readonly proveedorRepo: Repository<Proveedor>,
  ) {}

  crear(dto: CrearProveedorDto, empresaId: string) {
  const proveedor = this.proveedorRepo.create({ ...dto, empresaId } as Partial<Proveedor>);
  return this.proveedorRepo.save(proveedor);
}

  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const where: any = { empresaId };
    if (soloActivos) where.activo = true;

    const query = this.proveedorRepo.createQueryBuilder('p').where(where);

    if (filtro) {
      query.andWhere(
        '(p.nombre LIKE :filtro OR p.rfc LIKE :filtro OR p.email LIKE :filtro OR p.telefono LIKE :filtro OR p.razonSocial LIKE :filtro)',
        { filtro: `%${filtro}%` },
      );
    }

    return query.orderBy('p.nombre', 'ASC').getMany();
  }

  async actualizar(id: string, dto: Partial<CrearProveedorDto>, empresaId: string) {
    const proveedor = await this.proveedorRepo.findOne({ where: { id, empresaId } });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');

    Object.assign(proveedor, dto);
    return this.proveedorRepo.save(proveedor);
  }

  async toggleActivo(id: string, empresaId: string) {
    const proveedor = await this.proveedorRepo.findOne({ where: { id, empresaId } });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');

    proveedor.activo = !proveedor.activo;
    return this.proveedorRepo.save(proveedor);
  }
}