import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, MoreThan } from 'typeorm';
import { Producto } from '../entities/producto.entity';
import { MovimientoInventario } from '../entities/movimiento-inventario.entity';
import { LoteInventario } from '../entities/lote-inventario.entity';
import { ProductoEquivalencia } from '../entities/producto-equivalencia.entity';
import { StockPorAlmacen } from '../entities/stock-por-almacen.entity';
import { Almacen } from '../entities/almacen.entity';
import { StockService } from './stock.service';

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    @InjectRepository(LoteInventario)
    private readonly loteInventarioRepository: Repository<LoteInventario>,
    @InjectRepository(StockPorAlmacen)
    private readonly stockRepository: Repository<StockPorAlmacen>,
    @InjectRepository(ProductoEquivalencia)
    private readonly equivalenciaRepository: Repository<ProductoEquivalencia>,
    private readonly stockService: StockService,
    private readonly dataSource: DataSource,
  ) {}

  async registrarCompra(
    productoId: string,
    almacenId: string,
    cantidad: number,
    motivo: string,
    empresaId: string,
    numeroLote?: string,
    fechaCaducidad?: string,
    equivalenciaId?: string,
    manager?: EntityManager,
  ) {
    if (!almacenId) throw new BadRequestException('El almacén es obligatorio');
    if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero');

    const ejecutar = async (em: EntityManager) => {
      const almacen = await em.findOne(Almacen, { where: { id: almacenId, empresaId } });
      if (!almacen) throw new UnauthorizedException('El almacén no existe o no pertenece a tu empresa');

      const producto = await em.findOne(Producto, {
        where: { id: productoId, empresaId },
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      let cantidadBase = cantidad;
      if (equivalenciaId) {
        const eq = await em.findOne(ProductoEquivalencia, {
          where: { id: equivalenciaId, productoId },
        });
        if (!eq) throw new BadRequestException('Empaque no válido');
        cantidadBase = cantidad * this.calcularFactorBase(eq);
      }

      const lote = await this.obtenerOCrearLote(
        em,
        productoId,
        almacenId,
        empresaId,
        numeroLote || 'ÚNICO',
        fechaCaducidad ? new Date(fechaCaducidad) : undefined,
      );

      // Bloqueo pesimista para evitar colisiones
      const loteActual = await em.createQueryBuilder(LoteInventario, 'lote')
        .setLock('pessimistic_write')
        .where('lote.id = :id', { id: lote.id })
        .getOne();

      if (!loteActual) throw new NotFoundException('Lote no encontrado durante el bloqueo');

      const stockAnterior = Number(loteActual.stockRestante);
      loteActual.stockRestante = stockAnterior + cantidadBase;
      await em.save(loteActual);

      await this.stockService.sincronizarResumen(productoId, almacenId, empresaId, em);

      const movimiento = em.create(MovimientoInventario, {
        productoId,
        almacenId,
        cantidad: cantidadBase,
        tipo: 'ENTRADA',
        motivo: motivo || 'Entrada de inventario (compra)',
        empresaId,
        stockAnterior,
        stockNuevo: loteActual.stockRestante,
        lote: loteActual.numeroLote,
        fechaCaducidadMovimiento: loteActual.fechaCaducidad,
      });
      await em.save(movimiento);

      return { mensaje: 'Compra registrada exitosamente', stockNuevo: loteActual.stockRestante };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  async registrarSalida(
    productoId: string,
    almacenId: string,
    cantidad: number,
    motivo: string,
    empresaId: string,
    equivalenciaId?: string,
    loteEspecificoId?: string,
    manager?: EntityManager,
  ) {
    if (!almacenId) throw new BadRequestException('El almacén es obligatorio');
    if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero');

    const ejecutar = async (em: EntityManager) => {
      const almacen = await em.findOne(Almacen, { where: { id: almacenId, empresaId } });
      if (!almacen) throw new UnauthorizedException('El almacén no existe o no pertenece a tu empresa');

      const producto = await em.findOne(Producto, {
        where: { id: productoId, empresaId },
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      let cantidadBase = cantidad;
      if (equivalenciaId) {
        const eq = await em.findOne(ProductoEquivalencia, {
          where: { id: equivalenciaId, productoId },
        });
        if (!eq) throw new BadRequestException('Empaque no válido');
        cantidadBase = cantidad * this.calcularFactorBase(eq);
      }

      let lotes: LoteInventario[];
      if (loteEspecificoId) {
        const loteManual = await em.createQueryBuilder(LoteInventario, 'lote')
          .setLock('pessimistic_write')
          .where('lote.id = :id', { id: loteEspecificoId })
          .andWhere('lote.productoId = :productoId', { productoId })
          .andWhere('lote.almacenId = :almacenId', { almacenId })
          .andWhere('lote.empresaId = :empresaId', { empresaId })
          .getOne();

        if (!loteManual || Number(loteManual.stockRestante) < cantidadBase) {
          throw new BadRequestException('Lote seleccionado inválido o stock insuficiente');
        }
        lotes = [loteManual];
      } else {
        lotes = await em.createQueryBuilder(LoteInventario, 'lote')
          .setLock('pessimistic_write')
          .where('lote.productoId = :productoId', { productoId })
          .andWhere('lote.almacenId = :almacenId', { almacenId })
          .andWhere('lote.empresaId = :empresaId', { empresaId })
          .andWhere('lote.stockRestante > 0')
          .getMany();
        
        lotes.sort((a, b) => {
          if (!a.fechaCaducidad && !b.fechaCaducidad) return 0;
          if (!a.fechaCaducidad) return 1;
          if (!b.fechaCaducidad) return -1;
          return a.fechaCaducidad.getTime() - b.fechaCaducidad.getTime();
        });
      }

      let restante = cantidadBase;
      const movimientos = [];
      for (const lote of lotes) {
        if (restante <= 0) break;
        const disponible = Number(lote.stockRestante);
        const aDescontar = Math.min(disponible, restante);
        const stockAnterior = disponible;
        
        lote.stockRestante = disponible - aDescontar;
        await em.save(lote);

        movimientos.push(
          em.create(MovimientoInventario, {
            productoId,
            almacenId,
            cantidad: aDescontar,
            tipo: 'SALIDA',
            motivo: motivo || 'Salida de inventario',
            empresaId,
            stockAnterior,
            stockNuevo: lote.stockRestante,
            lote: lote.numeroLote,
            fechaCaducidadMovimiento: lote.fechaCaducidad,
          }),
        );
        restante -= aDescontar;
      }

      if (restante > 0) {
        throw new BadRequestException(`Stock insuficiente. Faltan ${restante} unidades.`);
      }

      await em.save(movimientos);
      await this.stockService.sincronizarResumen(productoId, almacenId, empresaId, em);

      return { mensaje: 'Salida registrada exitosamente' };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  async obtenerMovimientosPorProducto(productoId: string, empresaId: string) {
    return this.movimientoRepository.find({
      where: { productoId, empresaId },
      relations: ['almacen'],
      order: { fechaMovimiento: 'DESC' },
    });
  }

  async transferirStock(
    productoId: string,
    origenId: string,
    destinoId: string,
    cantidad: number,
    empresaId: string,
    manager?: EntityManager,
  ) {
    if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero');
    if (origenId === destinoId) throw new BadRequestException('No se puede transferir al mismo almacén');

    const ejecutar = async (em: EntityManager) => {
      const producto = await em.findOne(Producto, {
        where: { id: productoId, empresaId },
      });
      if (!producto) throw new NotFoundException('Producto no encontrado');

      const stockOrigen = await this.stockService.obtenerResumen(productoId, origenId, empresaId);
      if (stockOrigen < cantidad) {
        throw new BadRequestException(`Stock insuficiente en origen (disponible: ${stockOrigen})`);
      }

      await this.registrarSalida(
        productoId,
        origenId,
        cantidad,
        `Transferencia a almacén ${destinoId}`,
        empresaId,
        undefined,
        undefined,
        em,
      );

      await this.registrarCompra(
        productoId,
        destinoId,
        cantidad,
        `Transferencia desde almacén ${origenId}`,
        empresaId,
        'TRANSFER',
        undefined,
        undefined,
        em,
      );

      return { mensaje: 'Transferencia realizada correctamente' };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  async ajusteManual(
    productoId: string,
    almacenId: string,
    cantidad: number,
    tipo: 'INGRESO' | 'MERMA',
    motivo: string,
    empresaId: string,
    loteEspecificoId?: string,
    manager?: EntityManager,
  ) {
    if (!almacenId) throw new BadRequestException('El almacén es obligatorio');
    if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero');

    const ejecutar = async (em: EntityManager) => {
      if (tipo === 'MERMA') {
        await this.registrarSalida(
          productoId,
          almacenId,
          cantidad,
          `Merma: ${motivo}`,
          empresaId,
          undefined,
          loteEspecificoId,
          em,
        );
      } else {
        await this.registrarCompra(
          productoId,
          almacenId,
          cantidad,
          `Ajuste manual (ingreso): ${motivo}`,
          empresaId,
          'AJUSTE',
          undefined,
          undefined,
          em,
        );
      }
      return { mensaje: 'Ajuste realizado' };
    };

    if (manager) return ejecutar(manager);
    return this.dataSource.transaction(ejecutar);
  }

  async obtenerStockEnAlmacen(productoId: string, almacenId: string, empresaId: string) {
    return this.stockService.obtenerResumen(productoId, almacenId, empresaId);
  }

  async obtenerLotesPorProducto(productoId: string, empresaId: string, almacenId?: string) {
    const where: any = { productoId, empresaId };
    if (almacenId) where.almacenId = almacenId;
    return this.loteInventarioRepository.find({
      where,
      order: { fechaCaducidad: 'ASC' },
      relations: ['almacen'],
    });
  }

  private async obtenerOCrearLote(
    em: EntityManager,
    productoId: string,
    almacenId: string,
    empresaId: string,
    numeroLote: string,
    fechaCaducidad?: Date,
  ): Promise<LoteInventario> {
    let lote = await em.findOne(LoteInventario, {
      where: { productoId, almacenId, empresaId, numeroLote },
    });

    if (!lote) {
      lote = em.create(LoteInventario, {
        productoId,
        almacenId,
        empresaId,
        numeroLote,
        fechaCaducidad: fechaCaducidad || null,
        stockRestante: 0,
        activo: true,
      });
      await em.save(lote); 
    } else if (fechaCaducidad) {
      lote.fechaCaducidad = fechaCaducidad;
      await em.save(lote);
    }
    return lote;
  }

  private calcularFactorBase(equivalencia: ProductoEquivalencia): number {
    return Number(equivalencia.factorConversion);
  }
}