import { ConflictException, Injectable } from '@nestjs/common';
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

      /*
       * ══════════════════════════════════════════════════════════════════════
       * EL SUM Y EL SAVE NO ESTABAN PROTEGIDOS ENTRE SÍ
       * ----------------------------------------------------------------------
       * Esto hace `SUM(stockRestante)` sobre los lotes y después escribe el
       * total en `stock_por_almacen`. Sin ningún candado sobre esa fila.
       *
       * `registrarSalida` sí bloquea el resumen antes de validar
       * disponibilidad; `registrarCompra` sólo bloquea el LOTE y llama aquí.
       * Así que una entrada podía hacer su SUM antes de que una salida
       * simultánea confirmara su decremento, y escribir después: el total de
       * la salida se pierde y el resumen queda diciendo que hay más mercancía
       * de la que hay. Lo clásico de un *lost update*, y con el agravante de
       * que lo que se pierde es la resta: el almacén se queda con existencia
       * que no existe y que luego nadie puede vender.
       *
       * El candado es sobre un NOMBRE y no sobre la fila a propósito: la fila
       * del resumen puede NO EXISTIR todavía —es el primer movimiento de ese
       * producto en ese almacén— y un `FOR UPDATE` que no devuelve filas no
       * bloquea nada. Es el mismo error que acabamos de corregir en el folio
       * del crédito, y aquí habría dejado fuera justo el caso de la primera
       * entrada, que es cuando dos procesos chocan más fácil.
       *
       * Se toma al FINAL de lo que haga quien llama —después de sus candados
       * de fila—, nunca antes: así no se invierte el orden de adquisición con
       * `registrarSalida` y no se abre un abrazo mortal donde no lo había.
       * ══════════════════════════════════════════════════════════════════════
       */
      const bloqueo = await transactionalManager.query(
        `SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));`,
        [`RESUMEN_STOCK:${empresaId}:${productoId}:${almacenId}`],
      );
      if (Number(bloqueo?.[0]?.resultado ?? -999) < 0) {
        throw new ConflictException(
          'No fue posible actualizar la existencia del almacén. Intenta de nuevo.',
        );
      }
    }

    const resultado = await loteRepo
      .createQueryBuilder('lote')
      .select('COALESCE(SUM(lote.stockRestante), 0)', 'total')
      .where('lote.productoId = :productoId', { productoId })
      .andWhere('lote.almacenId = :almacenId', { almacenId })
      .andWhere('lote.empresaId = :empresaId', { empresaId })
      .andWhere('lote.activo=true')
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
  async recalcularTodoElStock(
    productoId: string,
    empresaId: string,
  ): Promise<void> {
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
