// recetas/services/recetas.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
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
    private readonly inventarioService: InventarioService,
    private readonly dataSource: DataSource,
  ) {}

  // ── GUARDAR RECETA (crea o reemplaza) ────────────────────────────────────
  async guardarReceta(dto: GuardarRecetaDto, empresaId: string) {
    const insumos = Array.isArray(dto.insumos) ? dto.insumos : [];
    const ids = insumos.map((item) => item.insumoId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'No se puede repetir un insumo en la receta',
      );
    }
    if (ids.includes(dto.productoId)) {
      throw new BadRequestException(
        'Un producto no puede ser insumo de sí mismo',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const productos = await manager.find(Producto, {
        where: {
          id: In([dto.productoId, ...ids]),
          empresaId,
          activo: true,
        },
      });
      const porId = new Map(
        productos.map((producto) => [producto.id, producto]),
      );
      const terminado = porId.get(dto.productoId);
      if (!terminado) {
        throw new BadRequestException(
          'El producto terminado no existe, está inactivo o pertenece a otra empresa',
        );
      }
      const faltantes = ids.filter((id) => !porId.has(id));
      if (faltantes.length) {
        throw new BadRequestException(
          'Uno o más insumos no existen, están inactivos o pertenecen a otra empresa',
        );
      }

      let receta = await manager.findOne(Receta, {
        where: { productoId: dto.productoId, empresaId },
      });
      if (!receta) {
        receta = manager.create(Receta, {
          empresaId,
          productoId: dto.productoId,
          activa: true,
          costoTeorico: 0,
        });
      }
      receta.rendimiento = dto.rendimiento ?? 1;
      receta.notas = dto.notas?.trim() || null;
      receta.productoNombre = terminado.nombre;
      receta = await manager.save(receta);
      await manager.delete(RecetaInsumo, { recetaId: receta.id, empresaId });

      let costoTeorico = 0;
      const nuevos = insumos.map((item) => {
        const producto = porId.get(item.insumoId)!;
        const costoUnitario = Number(producto.precioCompra) || 0;
        const merma = Number(item.mermaPorcentaje ?? 0);
        costoTeorico +=
          costoUnitario * Number(item.cantidad) * (1 + merma / 100);
        return manager.create(RecetaInsumo, {
          empresaId,
          recetaId: receta.id,
          insumoId: item.insumoId,
          insumoNombre: producto.nombre,
          cantidad: item.cantidad,
          unidad: item.unidad?.trim() || producto.unidadMedida || 'PIEZA',
          mermaPorcentaje: merma,
          costoUnitario,
        });
      });
      await manager.save(nuevos);
      receta.costoTeorico = Math.round(costoTeorico * 10_000) / 10_000;
      await manager.save(receta);

      return {
        ok: true,
        recetaId: receta.id,
        costoTeorico: receta.costoTeorico,
        insumos: nuevos.length,
      };
    });
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
    return this.recetaRepo.find({
      where: { empresaId, activa: true },
      order: { productoNombre: 'ASC' },
    });
  }

  // ── EXPLOTAR RECETA (sin descontar) — para previsualizar ─────────────────
  async explotar(productoId: string, cantidad: number, empresaId: string) {
    const receta = await this.recetaRepo.findOne({
      where: { productoId, empresaId },
      relations: ['insumos'],
    });
    if (!receta) return null;
    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = cantidad / rendimiento;
    return receta.insumos.map((ins) => ({
      insumoId: ins.insumoId,
      insumoNombre: ins.insumoNombre,
      cantidadBase: Number(ins.cantidad),
      cantidadConMerma:
        Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100),
      cantidadTotal:
        Number(ins.cantidad) * (1 + Number(ins.mermaPorcentaje) / 100) * factor,
      unidad: ins.unidad,
    }));
  }

  // ── PRODUCIR/VENDER: explota la receta y descuenta insumos del inventario ─
  // Este es el corazón. Cuando se vende una margarita, se llama aquí con
  // cantidad=1, y descuenta el tequila, licor, etc. del almacén.
  async producir(
    dto: ProducirDto,
    empresaId: string,
  ): Promise<ResultadoProduccion> {
    if (!Number.isFinite(Number(dto.cantidad)) || Number(dto.cantidad) <= 0) {
      throw new BadRequestException(
        'La cantidad a producir debe ser mayor a cero',
      );
    }
    const receta = await this.recetaRepo.findOne({
      where: { productoId: dto.productoId, empresaId },
      relations: ['insumos'],
    });
    if (!receta)
      throw new NotFoundException('Este producto no tiene receta definida');
    if (!receta.insumos?.length)
      throw new BadRequestException('La receta no tiene insumos');

    const rendimiento = Number(receta.rendimiento) || 1;
    const factor = dto.cantidad / rendimiento;

    return this.dataSource.transaction(async (manager) => {
      const descontados: ResultadoProduccion['insumosDescontados'] = [];
      let costoTotal = 0;

      for (const ins of receta.insumos) {
        const cantidadReal =
          Number(ins.cantidad) *
          (1 + Number(ins.mermaPorcentaje) / 100) *
          factor;
        const salida = await this.inventarioService.registrarSalida(
          ins.insumoId,
          dto.almacenId,
          cantidadReal,
          dto.motivo ?? `Producción de ${receta.productoNombre ?? 'producto'}`,
          empresaId,
          undefined,
          undefined,
          manager,
          { id: receta.id, tipo: 'PRODUCCION_RECETA' },
        );
        // Usa el costo real de los lotes consumidos, no el costo teórico
        // congelado cuando se creó la receta.
        costoTotal += Number(salida.costoTotal);
        descontados.push({
          insumoId: ins.insumoId,
          insumoNombre: ins.insumoNombre,
          cantidadDescontada: Math.round(cantidadReal * 10000) / 10000,
          unidad: ins.unidad,
        });
      }

      return {
        productoId: dto.productoId,
        cantidadProducida: dto.cantidad,
        insumosDescontados: descontados,
        costoTotal: Math.round(costoTotal * 100) / 100,
        advertencias: [],
      };
    });
  }

  // ── VERIFICAR si un producto tiene receta (para el POS) ──────────────────
  async tieneReceta(productoId: string, empresaId: string): Promise<boolean> {
    const count = await this.recetaRepo.count({
      where: { productoId, empresaId, activa: true },
    });
    return count > 0;
  }
}
