// src/catalogo/services/formas-pago.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormaPago } from '../entities/forma-pago.entity';
import { CrearFormaPagoDto } from '../dto/crear-forma-pago.dto';

@Injectable()
export class FormasPagoService {
  constructor(
    @InjectRepository(FormaPago)
    private readonly formaPagoRepo: Repository<FormaPago>,
  ) {}

  findAll(activos = true) {
    const where: any = {};
    if (activos) where.activo = true;
    return this.formaPagoRepo.find({ where, order: { nombre: 'ASC' } });
  }

  create(dto: CrearFormaPagoDto) {
    const fp = this.formaPagoRepo.create(dto);
    return this.formaPagoRepo.save(fp);
  }

  async update(id: string, dto: Partial<CrearFormaPagoDto>) {
    const fp = await this.formaPagoRepo.findOne({ where: { id } });
    if (!fp) throw new NotFoundException('Forma de pago no encontrada');
    Object.assign(fp, dto);
    return this.formaPagoRepo.save(fp);
  }

  async toggle(id: string) {
    const fp = await this.formaPagoRepo.findOne({ where: { id } });
    if (!fp) throw new NotFoundException('Forma de pago no encontrada');
    fp.activo = !fp.activo;
    return this.formaPagoRepo.save(fp);
  }
}