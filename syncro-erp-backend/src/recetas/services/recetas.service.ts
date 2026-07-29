// recetas/services/recetas.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Receta } from '../entities/receta.entity';
import { RecetaInsumo } from '../entities/receta-insumo.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { GuardarRecetaDto, ProducirDto } from '../dtos/recetas.dtos';

// Resultado de explotar y producir una receta
export interface ResultadoProduccion {
  productoId: string;
  cantidadProducida: number;
  insumosDescontados: {
    insumoId: string;
    insumoNombre: string | null;
    cantidadDescontada: number;
    unidad: string;
  }[];
  costoTotal: number;
  advertencias: string[];
}

@Injectable()
export class RecetasService {
  private readonly logger = new Logger(RecetasService.name);

  constructor(
    @InjectRepository(Receta) private readonly recetaRepo: Repository<Receta>,
    @InjectRepository(RecetaInsumo) private readonly riRepo: Repository<RecetaInsumo>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
    private readonly inventarioService: InventarioService,
    private readonly dataSource: DataSource,
  ) {}

  // ── GUARDAR RECETA (crea o reemplaza) ────────────────────────────────────
  async guardarReceta(dto: GuardarRecetaDto, empresaId: string) {
    const insumos = Array.isArray(dto.insumos) ? dto.insumos : [];

    // Buscar receta existente para este producto
    let receta = await this.recetaRepo.findOne({
      where: { productoId: dto.productoId, empresaId },
    });

    if (receta) {
      // Reemplazar insumos: borrar los viejos
      await this.riRepo.delete({ recetaId: receta.id, empresaId });
    } else {
      receta = this.recetaRepo.create({
        empresaId,
        productoId: dto.productoId,
        productoNombre: dto.productoNombre ?? null,
        activa: true,
      });
    }

    receta.rendimiento = dto.rendimiento ?? 1;
    receta.notas = dto.notas ?? null;
    receta.productoNombre = dto.productoNombre ?? receta.productoNombre;
    receta = await this.recetaRepo.save(receta);

    // Calcular costo teórico consultando el costo de cada insumo
    let costoTeorico = 0;
    const nuevos: RecetaInsumo[] = [];
    for (const it of insumos) {
      const prod = await this.productoRepo.findOne({ where: { id: it.insumoId, empresaId } });
      const costoUnitario = prod ? Number(prod.precioCompra) : 0;
      const merma = it.mermaPorcentaje ?? 0;
      const cantidadConMerma = Number(it.cantidad) * (1 + merma / 100);
      costoTeorico += costoUnitario * cantidadConMerma;

      nuevos.push(this.riRepo.create({
        empresaId,
        recetaId: receta.id,
        insumoId: it.insumoId,
        insumoNombre: it.insumoNombre ?? prod?.nombre ?? null,
        cantidad: it.cantidad,
        unidad: it.unidad ?? prod?.unidadMedida ?? 'PIEZA',
        mermaPorcentaje: merma,
        costoUnitario,
      }));
    }
    if (nuevos.length) await this.riRepo.save(nuevos);

    receta.costoTeorico = Math.round(costoTeorico * 10000) / 10000;
    await this.recetaRepo.save(receta);

    return { ok: true, recetaId: receta.id, costoTeorico: receta.costoTeorico, insumos: nuevos.length };
  }

  // ── OBTENER RECETA de un producto ────────────────────────────────────────
  async obtenerReceta(productoId: string, empresaId: string) {
    const receta = await this.recetaRepo.findOne({
      where: { productoId, empresaId },
      relations: ['insumos'],
    });
    return receta ?? null;
  }

  // ── LISTAR todas las recetas ─────────────────────────────────────────────
  listarRecetas(empresaId: string) {
    return this.recetaRepo.find({ where: { empresaId, activa: true }, order: { productoNombre: 'ASC' } });
  }

  // ── EXPLOTAR RECETA (sin descontar) — para previsualizar ─────────────────
  async explotar(productoId: string, cantidad: number, empresaId: string) {
    const receta = await this.recetaRepo.findOne({
      where: { productoId, empresaId }, relations: ['insumos'],
    });
    if (!receta) return null;
    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = cantidad / rendimiento;
    return receta.insumos.map(ins => ({
      insumoId: ins.insumoId,
      insumoNombre: ins.insumoNombre,
      cantidadBase: Number(ins.cantidad),
      cantidadConMerma: Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100),
      cantidadTotal: Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100) * factor,
      unidad: ins.unidad,
    }));
  }

  // ── PRODUCIR/VENDER: explota la receta y descuenta insumos del inventario ─
  // Este es el corazón. Cuando se vende una margarita, se llama aquí con
  // cantidad=1, y descuenta el tequila, licor, etc. del almacén.
  async producir(dto: ProducirDto, empresaId: string): Promise<ResultadoProduccion> {
    const receta = await this.recetaRepo.findOne({
      where: { productoId: dto.productoId, empresaId }, relations: ['insumos'],
    });
    if (!receta) throw new NotFoundException('Este producto no tiene receta definida');
    if (!receta.insumos?.length) throw new BadRequestException('La receta no tiene insumos');

    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = dto.cantidad / rendimiento;

    const descontados: ResultadoProduccion['insumosDescontados'] = [];
    const advertencias: string[] = [];
    let costoTotal = 0;

    for (const ins of receta.insumos) {
      const cantidadReal = Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100) * factor;
      try {
        await this.inventarioService.registrarSalida(
          ins.insumoId, dto.almacenId, cantidadReal,
          dto.motivo ?? `Producción de ${receta.productoNombre ?? 'producto'}`,
          empresaId,
        );
        costoTotal += Number(ins.costoUnitario) * cantidadReal;
        descontados.push({
          insumoId: ins.insumoId,
          insumoNombre: ins.insumoNombre,
          cantidadDescontada: Math.round(cantidadReal * 10000) / 10000,
          unidad: ins.unidad,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        advertencias.push(`${ins.insumoNombre ?? ins.insumoId}: ${msg}`);
        this.logger.warn(`Producción: no se pudo descontar ${ins.insumoNombre}: ${msg}`);
      }
    }

    return {
      productoId: dto.productoId,
      cantidadProducida: dto.cantidad,
      insumosDescontados: descontados,
      costoTotal: Math.round(costoTotal * 100) / 100,
      advertencias,
    };
  }

  // ── VERIFICAR si un producto tiene receta (para el POS) ──────────────────
  async tieneReceta(productoId: string, empresaId: string): Promise<boolean> {
    const count = await this.recetaRepo.count({ where: { productoId, empresaId, activa: true } });
    return count > 0;
  }
}