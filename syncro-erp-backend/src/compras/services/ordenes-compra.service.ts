import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { Cotizacion } from '../entities/cotizacion.entity';
import { Requisicion } from '../entities/requisicion.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { MailService } from '../../common/services/mail.service';
import { MotorContableService } from '../../finanzas/services/motor-contable.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service'; // ← NUEVO

@Injectable()
export class OrdenesCompraService {
  constructor(
    @InjectRepository(OrdenCompra)
    private readonly ocRepo: Repository<OrdenCompra>,
    @InjectRepository(DetalleOrdenCompra)
    private readonly detalleOCRepo: Repository<DetalleOrdenCompra>,
    @InjectRepository(Cotizacion)
    private readonly cotizacionRepo: Repository<Cotizacion>,
    @InjectRepository(Requisicion)
    private readonly requisicionRepo: Repository<Requisicion>,
    private readonly inventarioService: InventarioService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    private readonly motorContable: MotorContableService,
    private readonly notificaciones: NotificacionesService, // ← NUEVO
  ) { }

  async crearDesdeCotizacion(cotizacionId: string, empresaId: string) {
    const cotizacion = await this.cotizacionRepo.findOne({
      where: { id: cotizacionId, empresaId },
      relations: ['detalles', 'proveedor'],
    });
    if (!cotizacion) throw new NotFoundException('Cotización no encontrada');

    const oc = this.ocRepo.create({
      empresaId,
      cotizacionId: cotizacion.id,
      proveedorId: cotizacion.proveedorId,
      total: cotizacion.total,
    });
    const ocGuardada = await this.ocRepo.save(oc);

    const detalles = cotizacion.detalles.map((det) =>
      this.detalleOCRepo.create({
        ordenCompraId: ocGuardada.id,
        productoId: det.productoId,
        cantidad: det.cantidad,
        precioUnitario: det.precioUnitario,
        subtotal: det.subtotal,
      }),
    );
    await this.detalleOCRepo.save(detalles);

    await this.requisicionRepo.update(cotizacion.requisicionId, {
      estado: 'ORDEN_GENERADA',
    });

    const ocCompleta = await this.ocRepo.findOne({
      where: { id: ocGuardada.id },
      relations: ['detalles', 'detalles.producto', 'proveedor', 'cotizacion'],
    });

    // ← NUEVO: Email al proveedor con el detalle del pedido
    if (ocCompleta?.proveedor) {
      this.notificaciones.notificarOrdenCompraProveedor(ocCompleta, ocCompleta.proveedor)
        .catch(e => console.error('[Email] OC proveedor:', e?.message));
    }

    return ocCompleta;
  }

  async obtenerTodas(empresaId: string) {
    return this.ocRepo.find({
      where: { empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  async obtenerPorId(id: string, empresaId: string) {
    const oc = await this.ocRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'detalles.producto.equivalencias',
        'proveedor',
        'cotizacion'
      ],
    });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    return oc;
  }

  async cambiarEstado(id: string, empresaId: string, nuevoEstado: string) {
    const oc = await this.ocRepo.findOne({ where: { id, empresaId } });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    oc.estado = nuevoEstado as any;
    return this.ocRepo.save(oc);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * RECEPCIÓN DE MERCANCÍA
   * ───────────────────────────────────────────────────────────────────────────
   * CORRECCIONES SOBRE LA VERSIÓN ANTERIOR
   *
   * 1. TODO DENTRO DE UNA TRANSACCIÓN. Antes las entradas de inventario, la
   *    actualización de los detalles, la de la orden y la de la requisición
   *    ocurrían por separado. Si fallaba después de recibir dos de cinco
   *    productos, el inventario quedaba parcialmente actualizado y la orden
   *    seguía en ENVIADA — sin forma de saber qué había entrado ya.
   *
   * 2. SE PASA EL COSTO AL INVENTARIO. La orden siempre conoció el
   *    `precioUnitario` — lo usa para la póliza unas líneas abajo — pero no se
   *    lo pasaba a `registrarCompra`. Resultado: los lotes nacían con costo
   *    cero, y todas las salidas posteriores registraban costo cero. Era la
   *    mitad faltante del costeo de inventario.
   *
   * 3. NO SE PUEDE RECIBIR MÁS DE LO ORDENADO. Antes tomaba lo que enviara el
   *    frontend sin comparar. Se podían ordenar 10 piezas y recibir 1,000, lo
   *    que metía al inventario mercancía que nadie compró y generaba una
   *    póliza por un importe sin factura que la respaldara.
   *
   * 4. SE PASA `qr.manager`. Sin él, `registrarCompra` abría su propia
   *    transacción y quedaba fuera de esta: si el resto fallaba, la entrada de
   *    inventario ya estaba confirmada y no se revertía.
   *
   * PENDIENTE CONOCIDO: la recepción parcial sigue sobrescribiendo
   * `cantidadRecibidaOk` en lugar de acumular. Para entregas en varias
   * remesas hace falta un campo `cantidadRecibidaAcumulada` en la entidad.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async recibir(
    id: string,
    empresaId: string,
    almacenId: string,
    detallesFront: any[],
    usuarioActual?: any,
  ) {
    const oc = await this.ocRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'detalles.producto.equivalencias',
        'proveedor',
        'cotizacion',
      ],
    });

    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    if (oc.estado !== 'ENVIADA') {
      throw new BadRequestException('La OC debe estar en estado ENVIADA para recibir mercancía');
    }

    // ── Validación previa: nada de recibir más de lo ordenado ──
    // Se hace antes de abrir la transacción para fallar rápido y con un
    // mensaje que identifique el producto.
    for (const det of oc.detalles) {
      const captura = detallesFront.find(d => d.id === det.id);
      if (!captura) continue;

      const recibidaOk  = Number(captura.cantidadRecibidaOk  || 0);
      const rechazada   = Number(captura.cantidadRechazada   || 0);

      if (recibidaOk < 0 || rechazada < 0) {
        throw new BadRequestException(
          `${det.producto?.nombre ?? 'Producto'}: las cantidades no pueden ser negativas.`,
        );
      }

      let factor = 1;
      if (captura.equivalenciaId && det.producto?.equivalencias) {
        const eq = det.producto.equivalencias.find((e: any) => e.id === captura.equivalenciaId);
        if (eq) factor = Number(eq.factorConversion) || 1;
      }

      const unidadesBase = (recibidaOk + rechazada) * factor;
      const ordenado = Number(det.cantidad);

      if (unidadesBase > ordenado) {
        throw new BadRequestException(
          `${det.producto?.nombre ?? 'Producto'}: se ordenaron ${ordenado} unidades y ` +
          `estás capturando ${unidadesBase} (recibidas más rechazadas). ` +
          `Si el proveedor envió de más, documéntalo con una orden adicional.`,
        );
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let huboIncidencias = false;
    let ocGuardada: OrdenCompra;

    try {
      for (const det of oc.detalles) {
        const captura = detallesFront.find(d => d.id === det.id);

        if (!captura) {
          huboIncidencias = true;
          continue;
        }

        det.cantidadRecibidaOk = captura.cantidadRecibidaOk || 0;
        det.cantidadRechazada  = captura.cantidadRechazada  || 0;
        det.motivoRechazo      = captura.motivoRechazo      || null;

        let factorMultiplicador = 1;
        if (captura.equivalenciaId && det.producto?.equivalencias) {
          const eq = det.producto.equivalencias.find((e: any) => e.id === captura.equivalenciaId);
          if (eq) factorMultiplicador = Number(eq.factorConversion) || 1;
        }

        const totalUnidadesBase = det.cantidadRecibidaOk * factorMultiplicador;
        if (det.cantidadRechazada > 0 || totalUnidadesBase < Number(det.cantidad)) {
          huboIncidencias = true;
        }

        if (det.cantidadRecibidaOk > 0) {
          await this.inventarioService.registrarCompra(
            det.productoId,
            almacenId,
            det.cantidadRecibidaOk,
            `Recepción OC #${oc.id.slice(0, 8).toUpperCase()}`,
            empresaId,
            captura.lote,
            captura.fechaCaducidad,
            captura.equivalenciaId,
            qr.manager,                            // ← dentro de la transacción
            Number(det.precioUnitario || 0),       // ← el costo, que faltaba
            { id: oc.id, tipo: 'ORDEN_COMPRA' },   // ← trazabilidad del kardex
          );
        }
      }

      await qr.manager.save(oc.detalles);

      oc.estado = huboIncidencias ? 'CON_INCIDENCIAS' : 'RECIBIDA';
      ocGuardada = await qr.manager.save(oc);

      if (oc.cotizacion && oc.cotizacion.requisicionId) {
        await qr.manager.update(Requisicion, oc.cotizacion.requisicionId, {
          estado: (oc.estado === 'RECIBIDA' ? 'RECIBIDA' : 'CON_INCIDENCIAS') as any,
        });
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // ── Fuera de la transacción a propósito ──
    // Si la contabilidad o el correo fallan, la mercancía ya entró y eso es
    // correcto. El motor contable propaga el error y queda registrado.
    const detallesContables = ocGuardada.detalles
      .filter(d => (d.cantidadRecibidaOk ?? 0) > 0)
      .map(d => ({
        productoId:    d.productoId,
        cantidad:      d.cantidadRecibidaOk,
        costoUnitario: Number(d.precioUnitario || 0),
      }));

    if (detallesContables.length > 0) {
      this.motorContable.generarAsientoDeCompra({
        compraId:     ocGuardada.id,
        folio:        ocGuardada.id.slice(0, 8).toUpperCase(),
        fecha:        new Date(),
        empresaId,
        detalles:     detallesContables,
        totalGeneral: detallesContables.reduce((s, d) => s + d.cantidad * d.costoUnitario, 0),
      }).catch(err => console.error('[MotorContable] Error en compra:', err?.message));
    }

    this.enviarNotificacionRecepcion(ocGuardada, usuarioActual, huboIncidencias)
      .catch(err => console.error('Error al notificar recepción:', err));

    return ocGuardada;
  }

  async obtenerParaRecepcion(empresaId: string) {
    return this.ocRepo.find({
      where: [
        { empresaId, estado: 'ENVIADA' as any },
        { empresaId, estado: 'RECIBIDA' as any },
        { empresaId, estado: 'CON_INCIDENCIAS' as any },
      ],
      relations: ['detalles', 'detalles.producto', 'proveedor'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  async pagarOrden(
    id: string,
    empresaId: string,
    dto: {
      montoPagado:       number;
      cuentaBancariaId?: string;
      referencia?:       string;
      fechaPago?:        string;
    },
  ) {
    const oc = await this.ocRepo.findOne({
      where:     { id, empresaId },
      relations: ['detalles', 'proveedor'],
    });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    if (!['RECIBIDA', 'CON_INCIDENCIAS'].includes(oc.estado)) {
      throw new BadRequestException(
        `Solo se pueden pagar órdenes recibidas. Estado actual: ${oc.estado}`,
      );
    }

    oc.estado = 'PAGADA' as any;
    const ocGuardada = await this.ocRepo.save(oc);

    this.motorContable.generarAsientoDePagoProveedor({
      ocId:             id,
      folio:            oc.id.slice(0, 8).toUpperCase(),
      fecha:            dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
      empresaId,
      montoPagado:      Number(dto.montoPagado) || Number(oc.total), // fallback al total de la OC
      cuentaBancariaId: dto.cuentaBancariaId,
    }).catch(e => console.error('[MotorContable] Error pago proveedor:', e?.message));

    return ocGuardada;
  }

  async contarPendientes(empresaId: string) {
    return this.ocRepo.count({ where: { empresaId, estado: 'PENDIENTE' } });
  }

  // ── Email recepción — tu HTML original mantenido intacto ─────────────────
  private async enviarNotificacionRecepcion(orden: any, almacenista: any, hayIncidencias: boolean) {
    const correosBrutos = [
      orden.usuario?.email,
      orden.proveedor?.email,
      orden.cotizacion?.requisicion?.solicitante?.email,
      almacenista?.email
    ];

    const correosValidos = correosBrutos.filter(
      email => email && typeof email === 'string' && email.trim() !== ''
    );
    if (correosValidos.length === 0) return;

    const destinatariosStr       = [...new Set(correosValidos)].join(', ');
    const ocCorta                = `OC-${orden.id.substring(0, 8).toUpperCase()}`;
    const fechaActual            = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const estadoTxt              = hayIncidencias ? 'RECIBIDO CON INCIDENCIAS' : 'RECEPCIÓN COMPLETA';
    const colorPrimario          = hayIncidencias ? '#ef4444' : '#059669';
    const colorFondoEncabezado   = hayIncidencias ? '#fef2f2' : '#ecfdf5';

    const filasProductos = orden.detalles.map((det: any) => `
      <tr>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px">
          <strong>${det.producto?.nombre || 'Producto sin nombre'}</strong><br/>
          <span style="color:#64748b;font-size:12px;font-family:monospace">SKU: ${det.producto?.sku || 'N/D'}</span>
        </td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;text-align:center">${det.cantidad}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#059669;font-size:14px;font-weight:bold;text-align:center">${det.cantidadRecibidaOk}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#ef4444;font-size:14px;font-weight:bold;text-align:center">${det.cantidadRechazada > 0 ? det.cantidadRechazada : '-'}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px">${det.motivoRechazo || 'N/A'}</td>
      </tr>`).join('');

    const cuerpoHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f7f6;margin:0;padding:0}
  .container{max-width:700px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,.05);border:1px solid #e2e8f0}
  .header{background:${colorFondoEncabezado};border-bottom:3px solid ${colorPrimario};padding:30px 40px;text-align:center}
  .header h1{margin:0;color:${colorPrimario};font-size:24px;text-transform:uppercase;letter-spacing:1px}
  .content{padding:40px}
  .info-grid{width:100%;margin-bottom:30px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:20px}
  .table-container{width:100%;border-collapse:collapse;margin-top:10px}
  .table-container th{background:#0f172a;color:#fff;padding:12px 15px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
  .footer{background:#f8fafc;padding:25px 40px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px}
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>Notificación de Recepción</h1>
    <p style="margin:10px 0 0;color:#475569;font-size:15px">Ingreso físico de inventario registrado en Syncro ERP</p>
  </div>
  <div class="content">
    <table class="info-grid" cellpadding="10">
      <tr>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Número de Orden</span><strong>${ocCorta}</strong></td>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Estado</span><span style="padding:4px 10px;border-radius:4px;font-size:12px;font-weight:bold;color:${colorPrimario};border:1px solid ${colorPrimario};background:${colorFondoEncabezado}">${estadoTxt}</span></td>
      </tr>
      <tr>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Proveedor</span>${orden.proveedor?.nombre || 'No Especificado'}</td>
        <td><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Recibido por</span>${almacenista?.nombreCompleto || almacenista?.nombre || 'Almacén'}</td>
      </tr>
      <tr>
        <td colspan="2"><span style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:bold;display:block">Fecha y hora</span>${fechaActual}</td>
      </tr>
    </table>
    <h3 style="color:#0f172a;font-size:16px;margin:0 0 15px;border-bottom:2px solid #e2e8f0;padding-bottom:10px">Detalle de la Captura Física</h3>
    <table class="table-container">
      <thead><tr>
        <th>Producto</th><th style="text-align:center">Esperado</th>
        <th style="text-align:center">Recibido OK</th>
        <th style="text-align:center">Rechazado</th><th>Motivo</th>
      </tr></thead>
      <tbody>${filasProductos}</tbody>
    </table>
    <div style="margin-top:30px;padding:15px;border-left:4px solid ${colorPrimario};background:#f8fafc">
      <p style="margin:0;color:#334155;font-size:14px">
        ${hayIncidencias
          ? '<strong>Acción Requerida:</strong> Esta recepción presenta discrepancias. El área de compras debe coordinar la devolución o nota de crédito con el proveedor.'
          : '<strong>Recepción Exitosa:</strong> Todas las partidas coinciden. El inventario ha sido actualizado.'}
      </p>
    </div>
  </div>
  <div class="footer">
    <p style="margin:0"><strong>Syncro ERP</strong> • Sistema de Gestión Empresarial</p>
    <p style="margin:5px 0 0;font-size:11px">Mensaje automático — No responder directamente.</p>
  </div>
</div></body></html>`;

    await this.mailService.enviarCorreo({
      destinatario: destinatariosStr,
      asunto:       `[Syncro ERP] Recepción Almacén: ${ocCorta} - ${estadoTxt}`,
      cuerpo:       `Recepción ${ocCorta} por ${almacenista?.nombre || 'Almacén'}. Estado: ${estadoTxt}`,
      cuerpoHtml,
    });
  }
}