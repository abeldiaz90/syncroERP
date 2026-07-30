import {
  Injectable,
  BadRequestException,
  NotFoundException,
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
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { CreditosService } from '../../credito/services/creditos.service';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  OrigenMovimiento,
  TipoMovimiento,
} from '../../tesoreria/entities/tesoreria.entity';
import { SaldosFavorService } from './saldos-favor.service';

// Métodos de pago que implican crédito (el email lo manda CreditosService)
const METODOS_CREDITO = new Set([
  'CREDITO_30D',
  'CREDITO_60D',
  'CREDITO_90D',
  'MENSUALIDADES',
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
    private readonly asientos: AsientosPendientesService,
    private readonly creditos: CreditosService,
    private readonly notificaciones: NotificacionesService,
    private readonly tesoreria: TesoreriaService,
    private readonly saldosFavor: SaldosFavorService,
  ) {}

  // ── Almacén por defecto ────────────────────────────────────────
  private async obtenerAlmacenDefault(empresaId: string): Promise<string> {
    const almacen = await this.almacenRepo.findOne({
      where: { empresaId, activo: true },
      order: { fechaCreacion: 'ASC' },
    });
    if (!almacen)
      throw new BadRequestException(
        'No hay almacenes activos. Configura al menos uno en Catálogo → Almacenes.',
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
      throw new BadRequestException(
        'La venta debe tener al menos un producto.',
      );
    }

    const almacenId =
      dto.almacenId || (await this.obtenerAlmacenDefault(empresaId));

    // ── Precios, impuestos y descuentos los decide el SERVIDOR ──
    // El navegador solo dijo qué producto y cuánta cantidad. `precioMostrado`
    // se manda únicamente para detectar que la pantalla estaba desactualizada;
    // nunca se usa para calcular.
    const resuelta = await this.precios.resolverVenta(
      dto.detalles.map((d) => ({
        productoId: d.productoId,
        cantidad: d.cantidad,
        descuentoSolicitado: d.descuento,
        equivalenciaId: (d as { equivalenciaId?: string }).equivalenciaId,
        loteEspecificoId: (d as { loteEspecificoId?: string }).loteEspecificoId,
        precioMostrado: d.precioUnitario,
      })),
      empresaId,
      {
        listaPrecioId: (dto as { listaPrecioId?: string }).listaPrecioId,
        rolUsuario,
      },
    );

    const detallesCalculados = resuelta.detalles;
    const { subtotal, descuento, impuestoTotal, total } = resuelta;

    const esCredito = METODOS_CREDITO.has(dto.metodoPago);
    if (esCredito && !dto.clienteId) {
      throw new BadRequestException(
        'Una venta a crédito requiere seleccionar un cliente.',
      );
    }
    if (esCredito && !dto.credito) {
      throw new BadRequestException(
        'Faltan las condiciones del crédito. La venta y el crédito deben registrarse juntos.',
      );
    }
    if (!esCredito && dto.credito) {
      throw new BadRequestException(
        'Solo se aceptan condiciones de crédito en métodos de pago a crédito.',
      );
    }
    if (Number(dto.saldoFavorSolicitado ?? 0) > 0 && !dto.clienteId)
      throw new BadRequestException(
        'Para usar saldo a favor debes seleccionar un cliente.',
      );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (dto.clienteId) {
        const cliente = await qr.manager.findOne(Cliente, {
          where: { id: dto.clienteId, empresaId, activo: true },
        });
        if (!cliente) {
          throw new NotFoundException(
            'El cliente no existe, está inactivo o pertenece a otra empresa.',
          );
        }
      }
      if (dto.cuentaBancariaId) {
        const cuenta = await qr.manager.findOne(CuentaBancaria, {
          where: { id: dto.cuentaBancariaId, empresaId, activo: true },
        });
        if (!cuenta) {
          throw new NotFoundException(
            'La cuenta de cobro no existe, está inactiva o pertenece a otra empresa.',
          );
        }
      }

      // El bloqueo serializa la asignación del siguiente folio por empresa.
      const ultima = await qr.manager
        .createQueryBuilder(Venta, 'v')
        .setLock('pessimistic_write')
        .where('v.empresaId = :empresaId', { empresaId })
        .orderBy('v.folio', 'DESC')
        .getOne();
      const folio = (ultima?.folio ?? 0) + 1;

      // 1. Crear venta
      const venta = qr.manager.create(Venta, {
        empresaId,
        folio,
        clienteId: dto.clienteId || null,
        usuarioId: usuarioId || null,
        almacenId,
        subtotal,
        descuento,
        impuestoTotal,
        total,
        saldoFavorAplicado: 0,
        saldoFavorRestituido: 0,
        metodoPago: dto.metodoPago as Venta['metodoPago'],
        cuentaBancariaId: dto.cuentaBancariaId ?? null,
        montoRecibido: dto.montoRecibido ?? null,
        estado: 'COMPLETADA',
        notas: dto.notas,
      });
      const ventaGuardada = await qr.manager.save(venta);
      const saldoFavorAplicado =
        dto.clienteId && Number(dto.saldoFavorSolicitado ?? 0) > 0
          ? await this.saldosFavor.aplicar(qr.manager, {
              empresaId,
              clienteId: dto.clienteId,
              ventaId: ventaGuardada.id,
              solicitado: Number(dto.saldoFavorSolicitado),
              totalVenta: total,
              folio,
              usuarioId,
            })
          : 0;
      ventaGuardada.saldoFavorAplicado = saldoFavorAplicado;
      await qr.manager.save(ventaGuardada);
      const totalPorCobrar = Math.max(0, total - saldoFavorAplicado);
      if (
        dto.metodoPago === 'EFECTIVO' &&
        Number(dto.montoRecibido ?? 0) < totalPorCobrar
      ) {
        throw new BadRequestException(
          `El monto recibido debe cubrir ${totalPorCobrar.toFixed(2)} después del saldo a favor.`,
        );
      }

      // 2. Crear detalles — con los importes que resolvió el servidor
      const detalles = detallesCalculados.map((d) =>
        qr.manager.create(DetalleVenta, {
          ventaId: ventaGuardada.id,
          productoId: d.productoId,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          descuento: d.descuento || 0,
          subtotal: d.subtotal,
          impuestoPorcentaje: d.impuestoPorcentaje || 0,
          impuestoMonto: d.impuestoMonto || 0,
        }),
      );
      await qr.manager.save(detalles);

      // 3. Descontar inventario
      //    La validación de existencia vive aquí, dentro de la transacción y
      //    con bloqueo pesimista: es lo que impide que dos cajeros vendan la
      //    misma última pieza.
      const costosPorProducto = new Map<string, number>();
      for (const d of detallesCalculados) {
        const salida = await this.inventarioService.registrarSalida(
          d.productoId,
          almacenId,
          d.cantidad,
          `Ticket #${folio} - Venta ${ventaGuardada.id.slice(0, 8)}`,
          empresaId,
          d.equivalenciaId,
          d.loteEspecificoId,
          qr.manager,
          { id: ventaGuardada.id, tipo: 'VENTA' },
        );
        costosPorProducto.set(
          d.productoId,
          (costosPorProducto.get(d.productoId) ?? 0) +
            Number(salida.costoTotal ?? 0),
        );
      }

      let creditoGuardado: unknown = null;
      if (esCredito && dto.credito && dto.clienteId) {
        creditoGuardado = await this.creditos.crearCredito(
          {
            empresaId,
            clienteId: dto.clienteId,
            ventaId: ventaGuardada.id,
            tipoCredito: dto.credito.tipoCredito,
            montoVenta: total,
            enganche: Number(dto.credito.enganche ?? 0),
            saldoFavorAplicado,
            numeroCuotas: Number(dto.credito.numeroCuotas),
            tasaInteresMensual: Number(dto.credito.tasaInteresMensual ?? 0),
            sinInteres: dto.credito.sinInteres,
            fechaInicio: dto.credito.fechaInicio,
            metodoPagoEnganche: dto.credito.metodoPagoEnganche,
            cuentaBancariaEngancheId: dto.credito.cuentaBancariaEngancheId,
            notas: `Generado con venta #${folio}`,
          },
          qr.manager,
        );
      }

      const importeTesoreria = esCredito
        ? Number(dto.credito?.enganche ?? 0)
        : totalPorCobrar;
      const cuentaTesoreriaId = esCredito
        ? dto.credito?.cuentaBancariaEngancheId
        : dto.cuentaBancariaId;
      if (importeTesoreria > 0 && cuentaTesoreriaId) {
        await this.tesoreria.registrarEnTransaccion(
          {
            cuentaBancariaId: cuentaTesoreriaId,
            fecha: new Date().toISOString().slice(0, 10),
            tipo: TipoMovimiento.INGRESO,
            importe: importeTesoreria,
            concepto: esCredito
              ? `Enganche venta #${folio}`
              : `Cobro venta #${folio}`,
            origen: OrigenMovimiento.VENTA,
            documentoId: ventaGuardada.id,
            tipoDocumento: esCredito ? 'ENGANCHE_VENTA' : 'VENTA',
            terceroId: dto.clienteId,
          },
          empresaId,
          usuarioId,
          qr.manager,
        );
      }

      await qr.commitTransaction();

      // 4. Contabilidad durable: si falla queda visible y se reintenta.
      await this.asientos.intentar(
        TipoAsiento.VENTA,
        {
          ventaId: ventaGuardada.id,
          folio,
          fecha: new Date(),
          empresaId,
          metodoPago: dto.metodoPago,
          cuentaBancariaId: dto.cuentaBancariaId ?? undefined,
          detalles: detallesCalculados.map((d) => ({
            productoId: d.productoId,
            cantidad: d.cantidad,
            subtotal: d.subtotal,
            impuestoMonto: d.impuestoMonto ?? 0,
            costoTotal: costosPorProducto.get(d.productoId) ?? 0,
          })),
          totalGeneral: total,
          enganche: esCredito ? Number(dto.credito?.enganche ?? 0) : 0,
          saldoFavorAplicado,
          cuentaBancariaEngancheId: dto.credito?.cuentaBancariaEngancheId,
        },
        empresaId,
        `VENTA-${folio}`,
        ventaGuardada.id,
      );

      // 5. Email de confirmación — solo para ventas de contado con cliente
      // Las ventas a crédito reciben email cuando se crea el CreditoCliente
      if (dto.clienteId && !METODOS_CREDITO.has(dto.metodoPago)) {
        this.enviarEmailVenta(ventaGuardada.id, empresaId, folio).catch((err) =>
          console.error(`[Email] Venta #${folio}:`, err?.message),
        );
      }

      const ventaCompleta = await this.obtenerPorId(
        ventaGuardada.id,
        empresaId,
      );

      // Si la pantalla mostraba otros precios, el punto de venta debe avisarlo:
      // se cobró el del catálogo, no el que veía el cajero.
      return {
        ...ventaCompleta,
        ...(creditoGuardado ? { credito: creditoGuardado } : {}),
        ...(resuelta.discrepancias.length > 0
          ? { discrepanciasPrecio: resuelta.discrepancias }
          : {}),
      };
    } catch (err) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Carga la venta completa con cliente y manda el email ───────
  private async enviarEmailVenta(
    ventaId: string,
    empresaId: string,
    folio: number,
  ) {
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
    pagina = 1,
    limite = 20,
    estado?: EstadoVenta,
    clienteId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    // Acotar antes de construir la consulta: un `limite` enorme traería la
    // tabla completa a memoria.
    pagina = Math.max(1, pagina);
    limite = Math.min(100, Math.max(1, limite));

    const qb = this.ventaRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.cliente', 'c')
      .leftJoinAndSelect('v.detalles', 'd')
      .leftJoinAndSelect('d.producto', 'p')
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
    return {
      ventas,
      total,
      paginaActual: pagina,
      totalPaginas: Math.ceil(total / limite),
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
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const [hoyRes, semanaRes] = await Promise.all([
      this.ventaRepo
        .createQueryBuilder('v')
        .where('v.empresaId = :e', { e: empresaId })
        .andWhere('v.fechaVenta >= :hoy', { hoy })
        .andWhere('v.fechaVenta < :manana', { manana })
        .andWhere('v.estado != :a', { a: 'ANULADA' })
        .select('COUNT(v.id)', 'cantidad')
        .addSelect('COALESCE(SUM(v.total - v.totalDevuelto), 0)', 'total')
        .getRawOne(),
      this.ventaRepo
        .createQueryBuilder('v')
        .where('v.empresaId = :e', { e: empresaId })
        .andWhere('v.fechaVenta >= :inicio', {
          inicio: new Date(Date.now() - 7 * 86400000),
        })
        .andWhere('v.estado != :a', { a: 'ANULADA' })
        .select('COALESCE(SUM(v.total - v.totalDevuelto), 0)', 'total')
        .getRawOne(),
    ]);

    return {
      ventasHoy: Number(hoyRes?.cantidad) || 0,
      totalHoy: Number(hoyRes?.total) || 0,
      ticketPromedio:
        hoyRes?.cantidad > 0
          ? Number(hoyRes.total) / Number(hoyRes.cantidad)
          : 0,
      totalSemana: Number(semanaRes?.total) || 0,
    };
  }

  async obtenerTopProductos(empresaId: string, dias = 30) {
    const desde = new Date(Date.now() - dias * 86400000);
    return this.detalleRepo
      .createQueryBuilder('d')
      .leftJoin('d.venta', 'v')
      .leftJoin('d.producto', 'p')
      .select('p.id', 'productoId')
      .addSelect('p.nombre', 'nombre')
      .addSelect('p.sku', 'sku')
      .addSelect('SUM(d.cantidad - d.cantidadDevuelta)', 'cantidad')
      .addSelect(
        'SUM(CASE WHEN d.cantidad = 0 THEN 0 ELSE d.subtotal * (d.cantidad - d.cantidadDevuelta) / d.cantidad END)',
        'importe',
      )
      .where('v.empresaId = :e', { e: empresaId })
      .andWhere('v.fechaVenta >= :desde', { desde })
      .andWhere('v.estado != :a', { a: 'ANULADA' })
      .groupBy('p.id')
      .addGroupBy('p.nombre')
      .addGroupBy('p.sku')
      .orderBy('SUM(d.cantidad - d.cantidadDevuelta)', 'DESC')
      .limit(10)
      .getRawMany();
  }
}
