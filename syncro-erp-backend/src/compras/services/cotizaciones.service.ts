// src/compras/services/cotizaciones.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cotizacion } from '../entities/cotizacion.entity';
import { DetalleCotizacion } from '../entities/detalle-cotizacion.entity';
import { CrearCotizacionDto } from '../dto/crear-cotizacion.dto';

@Injectable()
export class CotizacionesService {
    constructor(
        @InjectRepository(Cotizacion)
        private readonly cotizacionRepo: Repository<Cotizacion>,
        @InjectRepository(DetalleCotizacion)
        private readonly detalleRepo: Repository<DetalleCotizacion>,
    ) { }

    async crear(dto: CrearCotizacionDto, empresaId: string) {
        const cotizacion = this.cotizacionRepo.create({
            empresaId,
            requisicionId: dto.requisicionId,
            proveedorId: dto.proveedorId,
            subtotal: dto.subtotal,
            impuestoTotal: dto.impuestoTotal,
            total: dto.total,
            notas: dto.notas,
        });
        const guardada = await this.cotizacionRepo.save(cotizacion);

        const detalles = dto.detalles.map((det) =>
            this.detalleRepo.create({
                cotizacionId: guardada.id,
                productoId: det.productoId,
                cantidad: det.cantidad,
                precioUnitario: det.precioUnitario,
                subtotal: det.subtotal,
            }),
        );
        await this.detalleRepo.save(detalles);

        return this.cotizacionRepo.findOne({
            where: { id: guardada.id },
            relations: ['detalles', 'detalles.producto', 'proveedor'],
        });
    }

    async obtenerPorRequisicion(requisicionId: string, empresaId: string) {
        return this.cotizacionRepo.find({
            where: { requisicionId, empresaId },
            relations: ['detalles', 'detalles.producto', 'proveedor'],
            order: { fechaCotizacion: 'DESC' },
        });
    }

    async seleccionar(id: string, empresaId: string) {
        const cotizacion = await this.cotizacionRepo.findOne({
            where: { id, empresaId },
            relations: ['requisicion'],
        });
        if (!cotizacion) throw new NotFoundException('Cotización no encontrada');

        // Cambiar estado de la cotización a SELECCIONADA
        cotizacion.estado = 'SELECCIONADA';
        await this.cotizacionRepo.save(cotizacion);

        // Opcional: cambiar estado de la requisición a "ORDEN_GENERADA" o similar
        // pero lo haremos después con la orden de compra.

        return cotizacion;
    }

    async obtenerPorId(id: string, empresaId: string) {
        const cot = await this.cotizacionRepo.findOne({
            where: { id, empresaId },
            relations: ['detalles', 'detalles.producto', 'proveedor', 'requisicion'],
        });
        if (!cot) throw new NotFoundException('Cotización no encontrada');
        return cot;
    }
}