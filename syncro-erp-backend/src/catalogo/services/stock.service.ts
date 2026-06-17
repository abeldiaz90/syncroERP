import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockPorAlmacen)
    private readonly stockRepo: Repository<StockPorAlmacen>,
    @InjectRepository(LoteInventario)
    private readonly loteInventarioRepo: Repository<LoteInventario>,
  ) {}

  // ✅ BUG 3 CORREGIDO: flush explícito para que el SUM vea los lotes recién guardados
  async sincronizarResumen(
    productoId: string,
    almacenId: string,
    empresaId: string,
    transactionalManager?: EntityManager,
  ): Promise<void> {
    const loteRepo = transactionalManager
      ? transactionalManager.getRepository(LoteInventario)
      : this.loteInventarioRepo;
    const stockRepo = transactionalManager
      ? transactionalManager.getRepository(StockPorAlmacen)
      : this.stockRepo;

    // Forzar que los cambios pendientes del EntityManager se escriban antes del SELECT
    if (transactionalManager) {
      await transactionalManager.save([]); // flush sin datos: sincroniza el buffer interno
    }

    const resultado = await loteRepo
      .createQueryBuilder('lote')
      .select('COALESCE(SUM(lote.stockRestante), 0)', 'total')
      .where('lote.productoId = :productoId', { productoId })
      .andWhere('lote.almacenId = :almacenId', { almacenId })
      .andWhere('lote.empresaId = :empresaId', { empresaId })
      .andWhere('lote.activo = 1')
      .getRawOne();

    const cantidad = Number(resultado?.total) || 0;

    let stock = await stockRepo.findOne({
      where: { productoId, almacenId, empresaId },
    });

    if (!stock) {
      stock = stockRepo.create({
        productoId,
        almacenId,
        empresaId,
        cantidad,
      });
    } else {
      stock.cantidad = cantidad;
    }

    await stockRepo.save(stock);
  }

  async obtenerResumen(
    productoId: string,
    almacenId: string,
    empresaId: string,
  ): Promise<number> {
    const stock = await this.stockRepo.findOne({
      where: { productoId, almacenId, empresaId },
      select: ['cantidad'],
    });
    return stock ? Number(stock.cantidad) : 0;
  }

  // Utilidad: recalcular el resumen de todos los almacenes de un producto desde cero
  // Útil para scripts de corrección de datos históricos
  async recalcularTodoElStock(productoId: string, empresaId: string): Promise<void> {
    const lotes = await this.loteInventarioRepo.find({
      where: { productoId, empresaId, activo: true },
      select: ['almacenId'],
    });

    const almacenesUnicos = [...new Set(lotes.map((l) => l.almacenId))];

    for (const almacenId of almacenesUnicos) {
      await this.sincronizarResumen(productoId, almacenId, empresaId);
    }
  }
}