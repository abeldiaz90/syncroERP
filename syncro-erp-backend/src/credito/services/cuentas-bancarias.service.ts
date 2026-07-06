import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaBancaria } from '../entities/cuenta-bancaria.entity';

@Injectable()
export class CuentasBancariasService {
  constructor(
    @InjectRepository(CuentaBancaria)
    private readonly repo: Repository<CuentaBancaria>,
  ) {}

  async crear(dto: Partial<CuentaBancaria>, empresaId: string) {
    const cb = this.repo.create({ ...dto, empresaId });
    return this.repo.save(cb);
  }

  async obtenerTodas(empresaId: string) {
    return this.repo.find({
      where: { empresaId, activo: true },
      relations: ['cuentaContable'],
      order: { tipo: 'ASC', nombre: 'ASC' },
    });
  }

  async obtenerPorId(id: string, empresaId: string) {
    const cb = await this.repo.findOne({ where: { id, empresaId }, relations: ['cuentaContable'] });
    if (!cb) throw new NotFoundException('Cuenta bancaria no encontrada');
    return cb;
  }

  async obtenerPorDefecto(empresaId: string) {
    return this.repo.findOne({ where: { empresaId, esPorDefecto: true, activo: true } });
  }

  async editar(id: string, dto: Partial<CuentaBancaria>, empresaId: string) {
    const cb = await this.obtenerPorId(id, empresaId);
    Object.assign(cb, dto);
    return this.repo.save(cb);
  }

  async toggleEstado(id: string, empresaId: string) {
    const cb = await this.obtenerPorId(id, empresaId);
    cb.activo = !cb.activo;
    return this.repo.save(cb);
  }
}