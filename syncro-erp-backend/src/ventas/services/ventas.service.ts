import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Venta, EstadoVenta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import { CrearVentaDto } from '../dto/crear-venta.dto';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';
import { MotorContableService } from '../../finanzas/services/motor-contable.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';

// Métodos de pago que implican crédito (el email lo manda CreditosService)
const METODOS_CREDITO = new Set([
  'CREDITO_30D', 'CREDITO_60D', 'CREDITO_90D', 'MENSUALIDADES',
]);

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
    private readonly motorContable: MotorContableService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ── Almacén por defecto ────────────────────────────────────────
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
  private async validarStock(
    detalles: CrearVentaDto['detalles'],
    almacenId: string,
    empresaId: string,
  ) {
    for (const det of detalles) {
      const stockAlmacen = await this.stockRepo.findOne({
        where: { productoId: det.productoId, almacenId, empresaId },
      });
      let disponible = Number(stockAlmacen?.cantidad ?? 0);

      if (!stockAlmacen) {
        const stocks = await this.stockRepo.find({
          where: { productoId: det.productoId, empresaId },
        });
        disponible = stocks.reduce((sum, s) => sum + Number(s.cantidad ?? 0), 0);
      }

      if (disponible < det.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente. Disponible: ${disponible}, solicitado: ${det.cantidad}.`
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CREAR VENTA
  // ─────────────────────────────────────────────────────────────────
  async crear(dto: CrearVentaDto, empresaId: string, usuarioId?: string) {
    if (!dto.detalles?.length) {
      throw new BadRequestException('La venta debe tener al menos un producto.');
    }

    const almacenId = dto.almacenId || await this.obtenerAlmacenDefault(empresaId);
    await this.validarStock(dto.detalles, almacenId, empresaId);
    const folio = await this.siguienteFolio(empresaId);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. Crear venta
      const venta = qr.manager.create(Venta, {
        empresaId,
        folio,
        clienteId:     dto.clienteId     || null,
        usuarioId:     usuarioId          || null,
        almacenId,
        subtotal:      dto.subtotal,
        descuento:     dto.descuento      || 0,
        impuestoTotal: dto.impuestoTotal,
        total:         dto.total,
        metodoPago:    dto.metodoPago     as Venta['metodoPago'],
        montoRecibido: dto.montoRecibido  ?? null,
        estado:        'COMPLETADA'       as EstadoVenta,
        notas:         dto.notas,
      });
      const ventaGuardada = await qr.manager.save(venta);

      // 2. Crear detalles
      const detalles = dto.detalles.map(d =>
        qr.manager.create(DetalleVenta, {
          ventaId:            ventaGuardada.id,
          productoId:         d.productoId,
          cantidad:           d.cantidad,
          precioUnitario:     d.precioUnitario,
          descuento:          d.descuento          || 0,
          subtotal:           d.subtotal,
          impuestoPorcentaje: d.impuestoPorcentaje || 0,
          impuestoMonto:      d.impuestoMonto      || 0,
        })
      );
      await qr.manager.save(detalles);

      // 3. Descontar inventario
      for (const d of dto.detalles) {
        await this.inventarioService.registrarSalida(
          d.productoId, almacenId, d.cantidad,
          `Ticket #${folio} - Venta ${ventaGuardada.id.slice(0, 8)}`,
          empresaId,
          undefined, undefined, qr.manager,
        );
      }

      await qr.commitTransaction();

      // 4. Motor contable (no bloquea)
      this.motorContable.generarAsientoDeVenta({
        ventaId:          ventaGuardada.id,
        folio,
        fecha:            new Date(),
        empresaId,
        metodoPago:       dto.metodoPago,
        cuentaBancariaId: dto.cuentaBancariaId ?? undefined,
        detalles:         dto.detalles.map(d => ({
          productoId:    d.productoId,
          cantidad:      d.cantidad,
          subtotal:      d.subtotal,
          impuestoMonto: d.impuestoMonto ?? 0,
        })),
        totalGeneral: dto.total,
      }).catch(err =>
        console.error(`[MotorContable] Error venta #${folio}:`, err?.message)
      );

      // 5. Email de confirmación — solo para ventas de contado con cliente
      // Las ventas a crédito reciben email cuando se crea el CreditoCliente
      if (dto.clienteId && !METODOS_CREDITO.has(dto.metodoPago)) {
        this.enviarEmailVenta(ventaGuardada.id, empresaId, folio)
          .catch(err => console.error(`[Email] Venta #${folio}:`, err?.message));
      }

      return this.obtenerPorId(ventaGuardada.id, empresaId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Carga la venta completa con cliente y manda el email ───────
  private async enviarEmailVenta(ventaId: string, empresaId: string, folio: number) {
    try {
      const venta = await this.ventaRepo.findOne({
        where: { id: ventaId, empresaId },
        relations: ['cliente', 'detalles', 'detalles.producto'],
      });
      if (!venta?.cliente?.email) return;
      await this.notificaciones.notificarVentaCompletada(venta, venta.cliente);
    } catch (e: any) {
      console.error(`[Email] Carga venta #${folio}:`, e?.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LISTADO
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
      .leftJoinAndSelect('v.cliente',   'c')
      .leftJoinAndSelect('v.detalles',  'd')
      .leftJoinAndSelect('d.producto',  'p')
      .where('v.empresaId = :empresaId', { empresaId })
      .orderBy('v.fechaVenta', 'DESC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setUTCHours(23, 59, 59, 999); // fin del día en UTC
      qb.andWhere('v.fechaVenta <= :fechaHasta', { fechaHasta: hasta });
    }

    if (fechaDesde) {
      const desde = new Date(fechaDesde);
      desde.setUTCHours(0, 0, 0, 0); // inicio del día en UTC
      qb.andWhere('v.fechaVenta >= :fechaDesde', { fechaDesde: desde });
    }

    const [ventas, total] = await qb.getManyAndCount();
    return { ventas, total, paginaActual: pagina, totalPaginas: Math.ceil(total / limite) };
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
  // ANULAR
  // ─────────────────────────────────────────────────────────────────
  async anular(id: string, empresaId: string) {
    const venta = await this.ventaRepo.findOne({
      where: { id, empresaId },
      relations: ['detalles'],
    });
    if (!venta)                     throw new NotFoundException('Venta no encontrada.');
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
    const hoy    = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

    const [hoyRes, semanaRes] = await Promise.all([
      this.ventaRepo.createQueryBuilder('v')
        .where('v.empresaId = :e',      { e: empresaId })
        .andWhere('v.fechaVenta >= :hoy',   { hoy })
        .andWhere('v.fechaVenta < :manana', { manana })
        .andWhere('v.estado != :a',     { a: 'ANULADA' })
        .select('COUNT(v.id)', 'cantidad')
        .addSelect('COALESCE(SUM(v.total), 0)', 'total')
        .getRawOne(),
      this.ventaRepo.createQueryBuilder('v')
        .where('v.empresaId = :e',       { e: empresaId })
        .andWhere('v.fechaVenta >= :inicio', { inicio: new Date(Date.now() - 7 * 86400000) })
        .andWhere('v.estado != :a',      { a: 'ANULADA' })
        .select('COALESCE(SUM(v.total), 0)', 'total')
        .getRawOne(),
    ]);

    return {
      ventasHoy:      Number(hoyRes?.cantidad)  || 0,
      totalHoy:       Number(hoyRes?.total)      || 0,
      ticketPromedio: hoyRes?.cantidad > 0
        ? Number(hoyRes.total) / Number(hoyRes.cantidad) : 0,
      totalSemana:    Number(semanaRes?.total)   || 0,
    };
  }

  async obtenerTopProductos(empresaId: string, dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);
    return this.detalleRepo.createQueryBuilder('d')
      .leftJoin('d.venta',    'v')
      .leftJoin('d.producto', 'p')
      .select('p.id',           'productoId')
      .addSelect('p.nombre',    'nombre')
      .addSelect('p.sku',       'sku')
      .addSelect('SUM(d.cantidad)', 'cantidad')
      .addSelect('SUM(d.subtotal)', 'importe')
      .where('v.empresaId = :e',     { e: empresaId })
      .andWhere('v.fechaVenta >= :desde', { desde })
      .andWhere('v.estado != :a',    { a: 'ANULADA' })
      .groupBy('p.id').addGroupBy('p.nombre').addGroupBy('p.sku')
      .orderBy('SUM(d.cantidad)', 'DESC')
      .limit(10)
      .getRawMany();
  }
}