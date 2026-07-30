import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Venta, EstadoVenta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import { CrearVentaDto } from '../dto/crear-venta.dto';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { PreciosService } from '../../catalogo/services/precios.service';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';
import { MotorContableService } from '../../finanzas/services/motor-contable.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';

// Métodos de pago que implican crédito (el email lo manda CreditosService)
const METODOS_CREDITO = new Set([
  'CREDITO_30D', 'CREDITO_60D', 'CREDITO_90D', 'MENSUALIDADES',
]);

/**
 * ============================================================================
 * CAMBIOS EN ESTA VERSIÓN
 * ----------------------------------------------------------------------------
 * 1. PRECIOS RESUELTOS EN EL SERVIDOR
 *
 *    La versión anterior ya recalculaba la aritmética, lo cual cerró el ataque
 *    de enviar `total: 1`. Pero seguía tomando `precioUnitario` e
 *    `impuestoPorcentaje` del navegador sin verificarlos:
 *
 *        if (!Number.isFinite(d.precioUnitario) || d.precioUnitario < 0) { ... }
 *        const bruto = redondear(d.cantidad * d.precioUnitario);
 *                                            ↑ sin comparar contra el catálogo
 *
 *    El ataque solo cambiaba de forma: en lugar de mandar `total: 1`, se
 *    mandaba `precioUnitario: 1` para un producto de $10,000. Y con
 *    `impuestoPorcentaje: 0` se podía vender algo gravado sin IVA.
 *
 *    Ahora `PreciosService` resuelve precio, impuesto y descuento contra la
 *    base. El navegador solo dice QUÉ producto y CUÁNTA cantidad.
 *
 * 2. CÓDIGO MUERTO ELIMINADO
 *
 *    · `validarStock()` — ya no se llamaba. Además tenía un defecto: cuando no
 *      encontraba stock del almacén pedido, sumaba TODOS los almacenes de la
 *      empresa y aprobaba la venta con existencia de otra sucursal.
 *      `registrarSalida()` ya valida dentro de la transacción y con bloqueo
 *      pesimista, que es donde debe validarse.
 *
 *    · `siguienteFolio()` — reemplazado por la asignación con bloqueo dentro
 *      de la transacción, unas líneas más abajo.
 *
 *    · `anular()` — el controlador ya llama a `AnulacionVentasService`, que sí
 *      revierte contabilidad, crédito y devuelve al lote y costo originales.
 *      Dejar la versión vieja aquí era peligroso: alguien podía llamarla y
 *      obtener una anulación a medias.
 *
 * 3. DISCREPANCIAS DE PRECIO VISIBLES
 *
 *    Si la pantalla mostraba un precio distinto al del catálogo, se cobra el
 *    del catálogo y se devuelve la diferencia en `discrepanciasPrecio` para
 *    que el punto de venta avise al cajero.
 * ============================================================================
 */

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
    private readonly precios: PreciosService,
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

  // ─────────────────────────────────────────────────────────────────
  // CREAR VENTA
  // ─────────────────────────────────────────────────────────────────
  async crear(
    dto: CrearVentaDto,
    empresaId: string,
    usuarioId?: string,
    rolUsuario?: string,
  ) {
    if (!dto.detalles?.length) {
      throw new BadRequestException('La venta debe tener al menos un producto.');
    }

    const almacenId = dto.almacenId || await this.obtenerAlmacenDefault(empresaId);

    // ── Precios, impuestos y descuentos los decide el SERVIDOR ──
    // El navegador solo dijo qué producto y cuánta cantidad. `precioMostrado`
    // se manda únicamente para detectar que la pantalla estaba desactualizada;
    // nunca se usa para calcular.
    const resuelta = await this.precios.resolverVenta(
      dto.detalles.map((d) => ({
        productoId:          d.productoId,
        cantidad:            d.cantidad,
        descuentoSolicitado: d.descuento,
        equivalenciaId:      (d as { equivalenciaId?: string }).equivalenciaId,
        loteEspecificoId:    (d as { loteEspecificoId?: string }).loteEspecificoId,
        precioMostrado:      d.precioUnitario,
      })),
      empresaId,
      {
        listaPrecioId: (dto as { listaPrecioId?: string }).listaPrecioId,
        rolUsuario,
      },
    );

    const detallesCalculados = resuelta.detalles;
    const { subtotal, descuento, impuestoTotal, total } = resuelta;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // El bloqueo serializa la asignación del siguiente folio por empresa.
      const ultima = await qr.manager.createQueryBuilder(Venta, 'v')
        .setLock('pessimistic_write')
        .where('v.empresaId = :empresaId', { empresaId })
        .orderBy('v.folio', 'DESC')
        .getOne();
      const folio = (ultima?.folio ?? 0) + 1;

      // 1. Crear venta
      const venta = qr.manager.create(Venta, {
        empresaId,
        folio,
        clienteId:     dto.clienteId     || null,
        usuarioId:     usuarioId          || null,
        almacenId,
        subtotal,
        descuento,
        impuestoTotal,
        total,
        metodoPago:    dto.metodoPago     as Venta['metodoPago'],
        montoRecibido: dto.montoRecibido  ?? null,
        estado:        'COMPLETADA'       as EstadoVenta,
        notas:         dto.notas,
      });
      const ventaGuardada = await qr.manager.save(venta);

      // 2. Crear detalles — con los importes que resolvió el servidor
      const detalles = detallesCalculados.map(d =>
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
      //    La validación de existencia vive aquí, dentro de la transacción y
      //    con bloqueo pesimista: es lo que impide que dos cajeros vendan la
      //    misma última pieza.
      for (const d of detallesCalculados) {
        await this.inventarioService.registrarSalida(
          d.productoId, almacenId, d.cantidad,
          `Ticket #${folio} - Venta ${ventaGuardada.id.slice(0, 8)}`,
          empresaId,
          d.equivalenciaId, d.loteEspecificoId, qr.manager,
          { id: ventaGuardada.id, tipo: 'VENTA' },
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
        detalles:         detallesCalculados.map(d => ({
          productoId:    d.productoId,
          cantidad:      d.cantidad,
          subtotal:      d.subtotal,
          impuestoMonto: d.impuestoMonto ?? 0,
        })),
        totalGeneral: total,
      }).catch(err =>
        console.error(`[MotorContable] Error venta #${folio}:`, err?.message)
      );

      // 5. Email de confirmación — solo para ventas de contado con cliente
      // Las ventas a crédito reciben email cuando se crea el CreditoCliente
      if (dto.clienteId && !METODOS_CREDITO.has(dto.metodoPago)) {
        this.enviarEmailVenta(ventaGuardada.id, empresaId, folio)
          .catch(err => console.error(`[Email] Venta #${folio}:`, err?.message));
      }

      const ventaCompleta = await this.obtenerPorId(ventaGuardada.id, empresaId);

      // Si la pantalla mostraba otros precios, el punto de venta debe avisarlo:
      // se cobró el del catálogo, no el que veía el cajero.
      return resuelta.discrepancias.length > 0
        ? { ...ventaCompleta, discrepanciasPrecio: resuelta.discrepancias }
        : ventaCompleta;
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
    // Acotar antes de construir la consulta: un `limite` enorme traería la
    // tabla completa a memoria.
    pagina = Math.max(1, pagina);
    limite = Math.min(100, Math.max(1, limite));

    const qb = this.ventaRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.cliente',   'c')
      .leftJoinAndSelect('v.detalles',  'd')
      .leftJoinAndSelect('d.producto',  'p')
      .where('v.empresaId = :empresaId', { empresaId })
      .orderBy('v.fechaVenta', 'DESC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (estado) qb.andWhere('v.estado = :estado', { estado });
    if (clienteId) qb.andWhere('v.clienteId = :clienteId', { clienteId });

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
  // ANULAR — ver AnulacionVentasService
  // ─────────────────────────────────────────────────────────────────
  // El método `anular()` que vivía aquí se eliminó a propósito. Solo devolvía
  // el stock y marcaba la venta, sin revertir la póliza contable, el crédito
  // del cliente ni el CFDI. El controlador ya usa `AnulacionVentasService`,
  // que hace la reversión completa y devuelve al lote y costo originales.
  //
  // Si necesitas anular desde código, inyecta ese servicio.

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