import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, Like } from 'typeorm';
import { Venta, EstadoVenta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import { CrearVentaDto } from '../dto/crear-venta.dto';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';

@Injectable()
export class VentasService {
  constructor(
    @InjectRepository(Venta)
    private readonly ventaRepo: Repository<Venta>,
    @InjectRepository(DetalleVenta)
    private readonly detalleRepo: Repository<DetalleVenta>,
    @InjectRepository(Almacen)
    private readonly almacenRepo: Repository<Almacen>,
    @InjectRepository(StockPorAlmacen)
    private readonly stockRepo: Repository<StockPorAlmacen>,
    private readonly inventarioService: InventarioService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Almacén por defecto (sin cache global — por empresa) ───────
  private async obtenerAlmacenDefault(empresaId: string): Promise<string> {
    const almacen = await this.almacenRepo.findOne({
      where: { empresaId, activo: true },
      order: { fechaCreacion: 'ASC' },
    });
    if (!almacen) throw new BadRequestException(
      'No hay almacenes activos. Configura al menos uno en Catálogo → Almacenes.'
    );
    return almacen.id;
  }

  // ── Siguiente folio por empresa ────────────────────────────────
  private async siguienteFolio(empresaId: string): Promise<number> {
    const ultima = await this.ventaRepo.findOne({
      where: { empresaId },
      order: { folio: 'DESC' },
      select: ['folio'],
    });
    return (ultima?.folio ?? 0) + 1;
  }

  // ── Validar stock antes de vender ──────────────────────────────
  // Busca primero en el almacén específico; si no hay registro,
  // suma el stock total de todos los almacenes de la empresa.
  private async validarStock(
    detalles: CrearVentaDto['detalles'],
    almacenId: string,
    empresaId: string,
  ) {
    for (const det of detalles) {
      // Stock en el almacén seleccionado
      const stockAlmacen = await this.stockRepo.findOne({
        where: { productoId: det.productoId, almacenId, empresaId },
      });
      let disponible = Number(stockAlmacen?.cantidad ?? 0);

      // Si no hay registro en ese almacén, revisar stock global
      if (!stockAlmacen) {
        const stocks = await this.stockRepo.find({
          where: { productoId: det.productoId, empresaId },
        });
        disponible = stocks.reduce((sum, s) => sum + Number(s.cantidad ?? 0), 0);
      }

      if (disponible < det.cantidad) {
        // Intentar obtener el nombre del producto para mensaje claro
        throw new BadRequestException(
          `Stock insuficiente. Disponible: ${disponible}, solicitado: ${det.cantidad}.`
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CREAR VENTA — con transacción completa
  // ─────────────────────────────────────────────────────────────────
  async crear(dto: CrearVentaDto, empresaId: string, usuarioId?: string) {
    if (!dto.detalles?.length) {
      throw new BadRequestException('La venta debe tener al menos un producto.');
    }

    const almacenId = dto.almacenId || await this.obtenerAlmacenDefault(empresaId);

    // Validar stock antes de cualquier movimiento
    await this.validarStock(dto.detalles, almacenId, empresaId);

    const folio = await this.siguienteFolio(empresaId);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. Crear venta principal
      const venta = qr.manager.create(Venta, {
        empresaId,
        folio,
        clienteId:    dto.clienteId  || null,
        usuarioId:    usuarioId       || null,
        almacenId,
        subtotal:     dto.subtotal,
        descuento:    dto.descuento   || 0,
        impuestoTotal:dto.impuestoTotal,
        total:        dto.total,
        metodoPago:   dto.metodoPago  as Venta['metodoPago'],
        montoRecibido:dto.montoRecibido ?? null,
        estado:       'COMPLETADA' as EstadoVenta,
        notas:        dto.notas,
      });
      const ventaGuardada = await qr.manager.save(venta);

      // 2. Crear detalles en batch
      const detalles = dto.detalles.map((d, idx) =>
        qr.manager.create(DetalleVenta, {
          ventaId:           ventaGuardada.id,
          productoId:        d.productoId,
          cantidad:          d.cantidad,
          precioUnitario:    d.precioUnitario,
          descuento:         d.descuento   || 0,
          subtotal:          d.subtotal,
          impuestoPorcentaje:d.impuestoPorcentaje || 0,
          impuestoMonto:     d.impuestoMonto      || 0,
        })
      );
      await qr.manager.save(detalles);

      // 3. Descontar inventario dentro de la transacción
      for (const d of dto.detalles) {
        await this.inventarioService.registrarSalida(
          d.productoId, almacenId, d.cantidad,
          `Ticket #${folio} - Venta ${ventaGuardada.id.slice(0, 8)}`,
          empresaId,
          undefined, undefined, qr.manager,
        );
      }

      await qr.commitTransaction();

      return this.obtenerPorId(ventaGuardada.id, empresaId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LISTADO CON PAGINACIÓN Y FILTROS
  // ─────────────────────────────────────────────────────────────────
  async obtenerTodas(
    empresaId: string,
    pagina     = 1,
    limite     = 20,
    estado?:   EstadoVenta,
    clienteId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const qb = this.ventaRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.cliente', 'c')
      .leftJoinAndSelect('v.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
      .where('v.empresaId = :empresaId', { empresaId })
      .orderBy('v.fechaVenta', 'DESC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (estado)     qb.andWhere('v.estado = :estado',     { estado });
    if (clienteId)  qb.andWhere('v.clienteId = :clienteId', { clienteId });
    if (fechaDesde) qb.andWhere('v.fechaVenta >= :fechaDesde', { fechaDesde: new Date(fechaDesde) });
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59);
      qb.andWhere('v.fechaVenta <= :fechaHasta', { fechaHasta: hasta });
    }

    const [ventas, total] = await qb.getManyAndCount();
    return {
      ventas,
      total,
      paginaActual:  pagina,
      totalPaginas:  Math.ceil(total / limite),
    };
  }

  async obtenerPorId(id: string, empresaId: string) {
    const venta = await this.ventaRepo.findOne({
      where: { id, empresaId },
      relations: ['cliente', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!venta) throw new NotFoundException('Venta no encontrada.');
    return venta;
  }

  // ─────────────────────────────────────────────────────────────────
  // ANULAR — reintegra stock al almacén original
  // ─────────────────────────────────────────────────────────────────
  async anular(id: string, empresaId: string) {
    const venta = await this.ventaRepo.findOne({
      where: { id, empresaId },
      relations: ['detalles'],
    });
    if (!venta) throw new NotFoundException('Venta no encontrada.');
    if (venta.estado === 'ANULADA') throw new BadRequestException('La venta ya fue anulada.');

    const almacenId = venta.almacenId || await this.obtenerAlmacenDefault(empresaId);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const det of venta.detalles) {
        await this.inventarioService.registrarCompra(
          det.productoId, almacenId, det.cantidad,
          `Anulación Ticket #${venta.folio}`,
          empresaId,
          undefined, undefined, undefined, qr.manager,
        );
      }
      venta.estado = 'ANULADA';
      await qr.manager.save(venta);
      await qr.commitTransaction();
      return venta;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // MÉTRICAS DASHBOARD
  // ─────────────────────────────────────────────────────────────────
  async obtenerMetricasVentas(empresaId: string) {
    const hoy   = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

    const [hoyRes, semanaRes] = await Promise.all([
      this.ventaRepo.createQueryBuilder('v')
        .where('v.empresaId = :e', { e: empresaId })
        .andWhere('v.fechaVenta >= :hoy', { hoy })
        .andWhere('v.fechaVenta < :manana', { manana })
        .andWhere('v.estado != :a', { a: 'ANULADA' })
        .select('COUNT(v.id)', 'cantidad')
        .addSelect('COALESCE(SUM(v.total), 0)', 'total')
        .getRawOne(),
      this.ventaRepo.createQueryBuilder('v')
        .where('v.empresaId = :e', { e: empresaId })
        .andWhere('v.fechaVenta >= :inicio', { inicio: new Date(Date.now() - 7 * 86400000) })
        .andWhere('v.estado != :a', { a: 'ANULADA' })
        .select('COALESCE(SUM(v.total), 0)', 'total')
        .getRawOne(),
    ]);

    return {
      ventasHoy:     Number(hoyRes?.cantidad)   || 0,
      totalHoy:      Number(hoyRes?.total)       || 0,
      ticketPromedio:hoyRes?.cantidad > 0
        ? Number(hoyRes.total) / Number(hoyRes.cantidad) : 0,
      totalSemana:   Number(semanaRes?.total)    || 0,
    };
  }

  async obtenerTopProductos(empresaId: string, dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);
    return this.detalleRepo.createQueryBuilder('d')
      .leftJoin('d.venta', 'v')
      .leftJoin('d.producto', 'p')
      .select('p.id',     'productoId')
      .addSelect('p.nombre', 'nombre')
      .addSelect('p.sku',    'sku')
      .addSelect('SUM(d.cantidad)', 'cantidad')
      .addSelect('SUM(d.subtotal)', 'importe')
      .where('v.empresaId = :e', { e: empresaId })
      .andWhere('v.fechaVenta >= :desde', { desde })
      .andWhere('v.estado != :a', { a: 'ANULADA' })
      .groupBy('p.id').addGroupBy('p.nombre').addGroupBy('p.sku')
      .orderBy('SUM(d.cantidad)', 'DESC')
      .limit(10)
      .getRawMany();
  }
}