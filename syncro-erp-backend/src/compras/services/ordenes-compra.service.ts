import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EstadoOC, OrdenCompra } from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { Cotizacion } from '../entities/cotizacion.entity';
import { Requisicion } from '../entities/requisicion.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { MailService } from '../../common/services/mail.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { PagoProveedor } from '../entities/pago-proveedor.entity';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';
import { RecepcionCompra } from '../entities/recepcion-compra.entity';

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
    private readonly asientos: AsientosPendientesService,
    private readonly notificaciones: NotificacionesService, // ← NUEVO
  ) {}

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
      totalPagado: 0,
      saldoPendiente: cotizacion.total,
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
      this.notificaciones
        .notificarOrdenCompraProveedor(ocCompleta, ocCompleta.proveedor)
        .catch((e) => console.error('[Email] OC proveedor:', e?.message));
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
    let oc = await this.ocRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'detalles.producto.impuesto',
        'detalles.producto.equivalencias',
        'proveedor',
        'cotizacion',
      ],
    });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    return oc;
  }

  async cambiarEstado(id: string, empresaId: string, nuevoEstado: EstadoOC) {
    const oc = await this.ocRepo.findOne({ where: { id, empresaId } });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    const transiciones: Partial<Record<EstadoOC, EstadoOC[]>> = {
      PENDIENTE: ['ENVIADA', 'CANCELADA'],
      ENVIADA: ['CANCELADA'],
      CON_INCIDENCIAS: ['ENVIADA', 'CANCELADA'],
    };
    if (!(transiciones[oc.estado] ?? []).includes(nuevoEstado)) {
      throw new BadRequestException(
        `No se permite cambiar una orden de ${oc.estado} a ${nuevoEstado}.`,
      );
    }
    oc.estado = nuevoEstado;
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
    let oc = await this.ocRepo.findOne({
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
    if (!['ENVIADA', 'CON_INCIDENCIAS'].includes(oc.estado)) {
      throw new BadRequestException(
        'La OC debe estar ENVIADA o CON_INCIDENCIAS para recibir mercancía',
      );
    }

    // ── Validación previa: nada de recibir más de lo ordenado ──
    // Se hace antes de abrir la transacción para fallar rápido y con un
    // mensaje que identifique el producto.
    for (const det of oc.detalles) {
      const captura = detallesFront.find((d) => d.id === det.id);
      if (!captura) continue;

      const recibidaOk = Number(captura.cantidadRecibidaOk || 0);
      const rechazada = Number(captura.cantidadRechazada || 0);

      if (recibidaOk < 0 || rechazada < 0) {
        throw new BadRequestException(
          `${det.producto?.nombre ?? 'Producto'}: las cantidades no pueden ser negativas.`,
        );
      }

      let factor = 1;
      if (captura.equivalenciaId && det.producto?.equivalencias) {
        const eq = det.producto.equivalencias.find(
          (e: any) => e.id === captura.equivalenciaId,
        );
        if (eq) factor = Number(eq.factorConversion) || 1;
      }

      const unidadesBase = (recibidaOk + rechazada) * factor;
      const ordenado = Number(det.cantidad);
      const yaRecibido = Number(det.cantidadRecibidaOk ?? 0);

      if (yaRecibido + unidadesBase > ordenado) {
        throw new BadRequestException(
          `${det.producto?.nombre ?? 'Producto'}: se ordenaron ${ordenado} unidades y ` +
            `ya se recibieron ${yaRecibido}; estás capturando ${unidadesBase} adicionales. ` +
            `Si el proveedor envió de más, documéntalo con una orden adicional.`,
        );
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let huboIncidencias = false;
    let ocGuardada: OrdenCompra;
    let recepcionId = '';
    const detallesContables: Array<{
      productoId: string;
      cantidad: number;
      costoUnitario: number;
      tasaIva?: number;
    }> = [];

    try {
      // Bloquear y volver a leer dentro de la transacción. La validación
      // anterior solo mejora el mensaje; esta es la que evita dos recepciones
      // simultáneas sobre el mismo saldo.
      const bloqueada = await qr.manager
        .createQueryBuilder(OrdenCompra, 'oc')
        .setLock('pessimistic_write')
        .where('oc.id = :id AND oc.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!bloqueada)
        throw new NotFoundException('Orden de compra no encontrada');
      if (!['ENVIADA', 'CON_INCIDENCIAS'].includes(bloqueada.estado)) {
        throw new BadRequestException(
          `La orden cambió al estado ${bloqueada.estado} mientras se recibía.`,
        );
      }
      const actual = await qr.manager.findOne(OrdenCompra, {
        where: { id, empresaId },
        relations: [
          'detalles',
          'detalles.producto',
          'detalles.producto.impuesto',
          'detalles.producto.equivalencias',
          'proveedor',
          'cotizacion',
        ],
      });
      if (!actual) throw new NotFoundException('Orden de compra no encontrada');
      oc = actual;

      const recepcion = await qr.manager.save(
        qr.manager.create(RecepcionCompra, {
          empresaId,
          ordenCompraId: oc.id,
          almacenId,
          detalleJson: JSON.stringify(detallesFront),
          recibidoPorId: usuarioActual?.id ?? usuarioActual?.sub,
        }),
      );
      recepcionId = recepcion.id;

      for (const det of oc.detalles) {
        const captura = detallesFront.find((d) => d.id === det.id);

        if (!captura) {
          huboIncidencias = true;
          continue;
        }

        const recibidaCaptura = Number(captura.cantidadRecibidaOk || 0);
        const rechazadaCaptura = Number(captura.cantidadRechazada || 0);
        det.motivoRechazo = captura.motivoRechazo || null;

        let factorMultiplicador = 1;
        if (captura.equivalenciaId && det.producto?.equivalencias) {
          const eq = det.producto.equivalencias.find(
            (e: any) => e.id === captura.equivalenciaId,
          );
          if (!eq) {
            throw new BadRequestException(
              `${det.producto?.nombre ?? 'Producto'}: el empaque seleccionado no es válido.`,
            );
          }
          factorMultiplicador = Number(eq.factorConversion) || 1;
        }

        const recibidasBase = recibidaCaptura * factorMultiplicador;
        const rechazadasBase = rechazadaCaptura * factorMultiplicador;
        const acumuladoAnterior = Number(det.cantidadRecibidaOk ?? 0);
        if (
          acumuladoAnterior + recibidasBase + rechazadasBase >
          Number(det.cantidad) + 0.0001
        ) {
          throw new BadRequestException(
            `${det.producto?.nombre ?? 'Producto'}: la recepción excede el saldo pendiente.`,
          );
        }

        det.cantidadRecibidaOk = acumuladoAnterior + recibidasBase;
        det.cantidadRechazada =
          Number(det.cantidadRechazada ?? 0) + rechazadasBase;

        if (
          rechazadaCaptura > 0 ||
          Number(det.cantidadRecibidaOk) < Number(det.cantidad)
        ) {
          huboIncidencias = true;
        }

        if (recibidaCaptura > 0) {
          await this.inventarioService.registrarCompra(
            det.productoId,
            almacenId,
            recibidaCaptura,
            `Recepción OC #${oc.id.slice(0, 8).toUpperCase()}`,
            empresaId,
            captura.lote,
            captura.fechaCaducidad,
            captura.equivalenciaId,
            qr.manager, // ← dentro de la transacción
            Number(det.precioUnitario || 0), // ← el costo, que faltaba
            { id: recepcion.id, tipo: 'RECEPCION_COMPRA' },
          );
          detallesContables.push({
            productoId: det.productoId,
            cantidad: recibidaCaptura,
            costoUnitario: Number(det.precioUnitario || 0),
            tasaIva: Number(det.producto?.impuesto?.porcentaje ?? 0) / 100,
          });
        }
      }

      await qr.manager.save(oc.detalles);

      const completa = oc.detalles.every(
        (d) => Number(d.cantidadRecibidaOk ?? 0) >= Number(d.cantidad),
      );
      oc.estado = completa ? 'RECIBIDA' : 'CON_INCIDENCIAS';
      huboIncidencias = !completa || huboIncidencias;
      ocGuardada = await qr.manager.save(oc);

      if (oc.cotizacion && oc.cotizacion.requisicionId) {
        await qr.manager.update(Requisicion, oc.cotizacion.requisicionId, {
          estado: (oc.estado === 'RECIBIDA'
            ? 'RECIBIDA'
            : 'CON_INCIDENCIAS') as any,
        });
      }

      await qr.commitTransaction();
    } catch (err) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // ── Fuera de la transacción a propósito ──
    // Si la contabilidad o el correo fallan, la mercancía ya entró y eso es
    // correcto. El motor contable propaga el error y queda registrado.
    if (detallesContables.length > 0) {
      await this.asientos.intentar(
        TipoAsiento.COMPRA,
        {
          compraId: recepcionId,
          folio: recepcionId.slice(0, 8).toUpperCase(),
          fecha: new Date(),
          empresaId,
          detalles: detallesContables,
          totalGeneral: detallesContables.reduce(
            (s, d) => s + d.cantidad * d.costoUnitario,
            0,
          ),
        },
        empresaId,
        `RECEPCION-${recepcionId.slice(0, 8)}`,
        recepcionId,
      );
    }

    this.enviarNotificacionRecepcion(
      ocGuardada,
      usuarioActual,
      huboIncidencias,
    ).catch((err) => console.error('Error al notificar recepción:', err));

    return { ...ocGuardada, recepcionId };
  }

  async obtenerParaRecepcion(empresaId: string) {
    return this.ocRepo.find({
      where: [
        { empresaId, estado: 'ENVIADA' },
        { empresaId, estado: 'RECIBIDA' },
        { empresaId, estado: 'CON_INCIDENCIAS' },
      ],
      relations: ['detalles', 'detalles.producto', 'proveedor'],
      order: { fechaCreacion: 'DESC' },
    });
  }

  async pagarOrden(
    id: string,
    empresaId: string,
    dto: {
      montoPagado: number;
      cuentaBancariaId?: string;
      referencia?: string;
      fechaPago?: string;
    },
    usuarioId?: string,
  ) {
    const monto = Number(dto.montoPagado);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto pagado debe ser mayor a cero.');
    }
    const fechaPago = dto.fechaPago ? new Date(dto.fechaPago) : new Date();
    if (Number.isNaN(fechaPago.getTime())) {
      throw new BadRequestException('La fecha de pago no es válida.');
    }

    const resultado = await this.dataSource.transaction(async (em) => {
      const oc = await em
        .createQueryBuilder(OrdenCompra, 'oc')
        .leftJoinAndSelect('oc.cotizacion', 'cotizacion')
        .setLock('pessimistic_write')
        .where('oc.id = :id AND oc.empresaId = :empresaId', { id, empresaId })
        .getOne();
      if (!oc) throw new NotFoundException('Orden de compra no encontrada');
      // Una orden con incidencias aún puede recibir reposiciones. Mezclar ese
      // estado con pagos impedía terminar la recepción posteriormente.
      if (!['RECIBIDA', 'PARCIALMENTE_PAGADA'].includes(oc.estado)) {
        throw new BadRequestException(
          `La orden no admite pagos en estado ${oc.estado}.`,
        );
      }

      if (dto.cuentaBancariaId) {
        const cuenta = await em.findOne(CuentaBancaria, {
          where: { id: dto.cuentaBancariaId, empresaId, activo: true },
        });
        if (!cuenta) {
          throw new NotFoundException(
            'La cuenta bancaria no existe, está inactiva o pertenece a otra empresa.',
          );
        }
      }

      const pagadoAnterior = Number(oc.totalPagado ?? 0);
      const saldo = Math.max(0, Number(oc.total) - pagadoAnterior);
      if (monto - saldo > 0.009) {
        throw new BadRequestException(
          `El pago excede el saldo pendiente de ${saldo.toFixed(2)}.`,
        );
      }

      const [acumuladoIva] = await em.query(
        `SELECT COALESCE(SUM(ivaReclasificado), 0) iva
         FROM pagos_proveedor
         WHERE empresaId = @0 AND ordenCompraId = @1`,
        [empresaId, id],
      );
      const ivaTotal = Number(oc.cotizacion?.impuestoTotal ?? 0);
      const ivaRestante = Math.max(
        0,
        Math.round(
          (ivaTotal - Number(acumuladoIva?.iva ?? 0) + Number.EPSILON) * 100,
        ) / 100,
      );
      const liquidaOrden = monto + 0.009 >= saldo;
      const ivaReclasificado =
        ivaTotal > 0 && Number(oc.total) > 0
          ? liquidaOrden
            ? ivaRestante
            : Math.min(
                ivaRestante,
                Math.round(
                  ((monto * ivaTotal) / Number(oc.total) + Number.EPSILON) *
                    100,
                ) / 100,
              )
          : 0;

      const pago = await em.save(
        em.create(PagoProveedor, {
          empresaId,
          ordenCompraId: id,
          monto,
          ivaReclasificado,
          cuentaBancariaId: dto.cuentaBancariaId,
          referencia: dto.referencia,
          fechaPago,
          registradoPorId: usuarioId,
        }),
      );

      oc.totalPagado = Math.round((pagadoAnterior + monto) * 100) / 100;
      oc.saldoPendiente = Math.max(
        0,
        Math.round((Number(oc.total) - Number(oc.totalPagado)) * 100) / 100,
      );
      oc.estado =
        Number(oc.saldoPendiente) <= 0 ? 'PAGADA' : 'PARCIALMENTE_PAGADA';
      const orden = await em.save(oc);
      return { orden, pago, ivaReclasificado };
    });

    await this.asientos.intentar(
      TipoAsiento.PAGO_PROVEEDOR,
      {
        ocId: id,
        pagoId: resultado.pago.id,
        folio: id.slice(0, 8).toUpperCase(),
        fecha: fechaPago,
        empresaId,
        montoPagado: monto,
        ivaReclasificado: resultado.ivaReclasificado,
        cuentaBancariaId: dto.cuentaBancariaId,
      },
      empresaId,
      `PAGO-OC-${resultado.pago.id}`,
      resultado.pago.id,
    );

    return resultado;
  }

  async contarPendientes(empresaId: string) {
    return this.ocRepo.count({ where: { empresaId, estado: 'PENDIENTE' } });
  }

  // ── Email recepción — tu HTML original mantenido intacto ─────────────────
  private async enviarNotificacionRecepcion(
    orden: any,
    almacenista: any,
    hayIncidencias: boolean,
  ) {
    const correosBrutos = [
      orden.usuario?.email,
      orden.proveedor?.email,
      orden.cotizacion?.requisicion?.solicitante?.email,
      almacenista?.email,
    ];

    const correosValidos = correosBrutos.filter(
      (email) => email && typeof email === 'string' && email.trim() !== '',
    );
    if (correosValidos.length === 0) return;

    const destinatariosStr = [...new Set(correosValidos)].join(', ');
    const ocCorta = `OC-${orden.id.substring(0, 8).toUpperCase()}`;
    const fechaActual = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const estadoTxt = hayIncidencias
      ? 'RECIBIDO CON INCIDENCIAS'
      : 'RECEPCIÓN COMPLETA';
    const colorPrimario = hayIncidencias ? '#ef4444' : '#059669';
    const colorFondoEncabezado = hayIncidencias ? '#fef2f2' : '#ecfdf5';

    const filasProductos = orden.detalles
      .map(
        (det: any) => `
      <tr>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px">
          <strong>${det.producto?.nombre || 'Producto sin nombre'}</strong><br/>
          <span style="color:#64748b;font-size:12px;font-family:monospace">SKU: ${det.producto?.sku || 'N/D'}</span>
        </td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;text-align:center">${det.cantidad}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#059669;font-size:14px;font-weight:bold;text-align:center">${det.cantidadRecibidaOk}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#ef4444;font-size:14px;font-weight:bold;text-align:center">${det.cantidadRechazada > 0 ? det.cantidadRechazada : '-'}</td>
        <td style="padding:12px 15px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px">${det.motivoRechazo || 'N/A'}</td>
      </tr>`,
      )
      .join('');

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
        ${
          hayIncidencias
            ? '<strong>Acción Requerida:</strong> Esta recepción presenta discrepancias. El área de compras debe coordinar la devolución o nota de crédito con el proveedor.'
            : '<strong>Recepción Exitosa:</strong> Todas las partidas coinciden. El inventario ha sido actualizado.'
        }
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
      asunto: `[Syncro ERP] Recepción Almacén: ${ocCorta} - ${estadoTxt}`,
      cuerpo: `Recepción ${ocCorta} por ${almacenista?.nombre || 'Almacén'}. Estado: ${estadoTxt}`,
      cuerpoHtml,
    });
  }
}
