import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { Cotizacion } from '../entities/cotizacion.entity';
import { Requisicion } from '../entities/requisicion.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { MailService } from '../../common/services/mail.service';

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

    return this.ocRepo.findOne({
      where: { id: ocGuardada.id },
      relations: ['detalles', 'detalles.producto', 'proveedor', 'cotizacion'],
    });
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

  async recibir(id: string, empresaId: string, almacenId: string, detallesFront: any[], usuarioActual?: any) {
    // 1. Cargamos la OC con relaciones profundas (incluyendo equivalencias para el cálculo matemático)
    const oc = await this.ocRepo.findOne({
      where: { id, empresaId },
      relations: [
        'detalles',
        'detalles.producto',
        'detalles.producto.equivalencias', // <-- CRÍTICO para calcular cajas vs piezas
        'proveedor',
        'cotizacion'
      ],
    });

    if (!oc) throw new NotFoundException('Orden de compra no encontrada');
    if (oc.estado !== 'ENVIADA') {
      throw new BadRequestException('La OC debe estar en estado ENVIADA para recibir mercancía');
    }

    let huboIncidencias = false;

    // 2. Procesamos detalles inyectando trazabilidad
    for (const det of oc.detalles) {
      const captura = detallesFront.find(d => d.id === det.id);

      if (captura) {
        det.cantidadRecibidaOk = captura.cantidadRecibidaOk || 0;
        det.cantidadRechazada = captura.cantidadRechazada || 0;
        det.motivoRechazo = captura.motivoRechazo || null;

        // Auditoría Backend: Calcular factor para saber si realmente hay incidencias
        let factorMultiplicador = 1;
        if (captura.equivalenciaId && det.producto?.equivalencias) {
          const eq = det.producto.equivalencias.find((e: any) => e.id === captura.equivalenciaId);
          if (eq) factorMultiplicador = Number(eq.factorConversion);
        }

        const totalUnidadesBase = det.cantidadRecibidaOk * factorMultiplicador;

        // Si rechazó algo, o si las unidades base son menores a lo esperado
        if (det.cantidadRechazada > 0 || totalUnidadesBase < Number(det.cantidad)) {
          huboIncidencias = true;
        }

        if (det.cantidadRecibidaOk > 0) {
          // 🚀 AQUÍ OCURRE LA MAGIA: Enviamos lote, caducidad y equivalencia al Kardex
          await this.inventarioService.registrarCompra(
            det.productoId,
            almacenId,
            det.cantidadRecibidaOk,
            `Recepción OC #${oc.id.slice(0, 8)}`,
            empresaId,
            captura.lote,               // Extraído del front
            captura.fechaCaducidad,     // Extraído del front
            captura.equivalenciaId      // Extraído del front
          );
        }
      } else {
        huboIncidencias = true; // Si el front no mandó una línea, es incidencia automática
      }
    }

    // 3. Guardamos detalles
    await this.detalleOCRepo.save(oc.detalles);

    // 4. Determinamos el estado y guardamos la OC
    oc.estado = huboIncidencias ? 'CON_INCIDENCIAS' : 'RECIBIDA';
    const ocGuardada = await this.ocRepo.save(oc);

    // 5. Cierre de trazabilidad: Actualizar la Requisición madre
    if (oc.cotizacion && oc.cotizacion.requisicionId) {
      const updateData: { estado: any } = {
        estado: oc.estado === 'RECIBIDA' ? 'RECIBIDA' : 'CON_INCIDENCIAS'
      };

      await this.requisicionRepo.update(
        oc.cotizacion.requisicionId,
        updateData
      );
    }

    // 6. Notificación en segundo plano
    this.enviarNotificacionRecepcion(oc, usuarioActual, huboIncidencias)
      .catch(err => console.error('Error al notificar recepción:', err));

    return ocGuardada;
  }

  async contarPendientes(empresaId: string) {
    return this.ocRepo.count({ where: { empresaId, estado: 'PENDIENTE' } });
  }

  // ====================================================================
  // MÉTODO PRIVADO: GENERACIÓN Y ENVÍO DE CORREOS
  // ====================================================================
  private async enviarNotificacionRecepcion(orden: any, almacenista: any, hayIncidencias: boolean) {
    const correosBrutos = [
      orden.usuario?.email,
      orden.proveedor?.email,
      orden.cotizacion?.requisicion?.solicitante?.email,
      almacenista?.email
    ];

    const correosValidos = correosBrutos.filter(email => email && typeof email === 'string' && email.trim() !== '');
    if (correosValidos.length === 0) return;

    const destinatariosStr = [...new Set(correosValidos)].join(', ');

    const ocCorta = `OC-${orden.id.substring(0, 8).toUpperCase()}`;
    const fechaActual = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const estadoTxt = hayIncidencias ? 'RECIBIDO CON INCIDENCIAS' : 'RECEPCIÓN COMPLETA';
    const colorPrimario = hayIncidencias ? '#ef4444' : '#059669';
    const colorFondoEncabezado = hayIncidencias ? '#fef2f2' : '#ecfdf5';

    const filasProductos = orden.detalles.map((det: any) => `
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px;">
          <strong>${det.producto?.nombre || 'Producto sin nombre'}</strong><br/>
          <span style="color: #64748b; font-size: 12px; font-family: monospace;">SKU: ${det.producto?.sku || 'N/D'}</span>
        </td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px; text-align: center;">
          ${det.cantidad}
        </td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #059669; font-size: 14px; font-weight: bold; text-align: center;">
          ${det.cantidadRecibidaOk}
        </td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #ef4444; font-size: 14px; font-weight: bold; text-align: center;">
          ${det.cantidadRechazada > 0 ? det.cantidadRechazada : '-'}
        </td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
          ${det.motivoRechazo || 'N/A'}
        </td>
      </tr>
    `).join('');

    const cuerpoHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
          .container { max-width: 700px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
          .header { background-color: ${colorFondoEncabezado}; border-bottom: 3px solid ${colorPrimario}; padding: 30px 40px; text-align: center; }
          .header h1 { margin: 0; color: ${colorPrimario}; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
          .header p { margin: 10px 0 0 0; color: #475569; font-size: 15px; }
          .content { padding: 40px; }
          .info-grid { display: table; width: 100%; margin-bottom: 30px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px; }
          .info-row { display: table-row; }
          .info-cell { display: table-cell; padding: 10px; width: 50%; }
          .info-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 4px; display: block; }
          .info-value { font-size: 15px; color: #0f172a; font-weight: 600; }
          .table-container { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .table-container th { background-color: #0f172a; color: #ffffff; padding: 12px 15px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          .table-container th.center { text-align: center; }
          .footer { background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px; line-height: 1.6; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; color: ${colorPrimario}; border: 1px solid ${colorPrimario}; background-color: ${colorFondoEncabezado}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Notificación de Recepción</h1>
            <p>Se ha registrado un ingreso físico de inventario en el sistema.</p>
          </div>
          <div class="content">
            <div class="info-grid">
              <div class="info-row">
                <div class="info-cell">
                  <span class="info-label">Número de Orden</span>
                  <span class="info-value">${ocCorta}</span>
                </div>
                <div class="info-cell">
                  <span class="info-label">Estado del Ingreso</span>
                  <span class="badge">${estadoTxt}</span>
                </div>
              </div>
              <div class="info-row">
                <div class="info-cell" style="padding-top: 20px;">
                  <span class="info-label">Proveedor</span>
                  <span class="info-value">${orden.proveedor?.nombre || 'No Especificado'}</span>
                </div>
                <div class="info-cell" style="padding-top: 20px;">
                  <span class="info-label">Recibido en Almacén Por</span>
                  <span class="info-value">${almacenista?.nombre || 'Usuario de Almacén'}</span>
                </div>
              </div>
              <div class="info-row">
                <div class="info-cell" style="padding-top: 20px;">
                  <span class="info-label">Fecha y Hora de Registro</span>
                  <span class="info-value" style="color: #475569; font-weight: normal;">${fechaActual}</span>
                </div>
              </div>
            </div>
            <h3 style="color: #0f172a; font-size: 16px; margin: 0 0 15px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Detalle de la Captura Física</h3>
            <table class="table-container">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="center">Esperado</th>
                  <th class="center">Recibido OK</th>
                  <th class="center">Rechazado</th>
                  <th>Motivo de Rechazo</th>
                </tr>
              </thead>
              <tbody>
                ${filasProductos}
              </tbody>
            </table>
            <div style="margin-top: 30px; padding: 15px; border-left: 4px solid ${colorPrimario}; background-color: #f8fafc;">
              <p style="margin: 0; color: #334155; font-size: 14px;">
                ${hayIncidencias
        ? '<strong>Acción Requerida:</strong> Este documento presenta discrepancias o mermas. El departamento de compras debe ingresar a Syncro ERP para validar el manifiesto y coordinar la devolución o nota de crédito con el proveedor.'
        : '<strong>Recepción Exitosa:</strong> Todas las partidas coinciden con el documento original. El inventario ha sido actualizado y está disponible para la operación.'}
              </p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;"><strong>Syncro ERP</strong> • Sistema Inteligente de Gestión Integrada</p>
            <p style="margin: 5px 0 0 0; font-size: 11px;">Este es un mensaje automatizado generado por la plataforma. Por favor, no responda directamente a este correo.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.mailService.enviarCorreo({
      destinatario: destinatariosStr,
      asunto: `[Syncro ERP] Recepción Almacén: ${ocCorta} - ${estadoTxt}`,
      cuerpo: `Se ha recibido la orden ${ocCorta} por ${almacenista?.nombre || 'Almacén'}. Estado: ${estadoTxt}`,
      cuerpoHtml: cuerpoHtml
    });
  }
}