import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from '../common/services/mail.service';
import {
  htmlConfirmacionVenta, htmlCreditoOtorgado,
  htmlRecordatorioCuota, htmlCuotaVencida,
  htmlOrdenCompraProveedor, htmlStockBajo, htmlBienvenidaUsuario,
} from './email-templates';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly mailService: MailService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // 1. VENTA COMPLETADA (efectivo / tarjeta / transferencia)
  // ══════════════════════════════════════════════════════════════════════════
  async notificarVentaCompletada(venta: any, cliente?: any): Promise<void> {
    if (!cliente?.email) return;
    try {
      await this.mailService.enviarCorreo({
        destinatario: cliente.email,
        asunto:       `✅ Confirmación de compra #${String(venta.folio).padStart(5,'0')} — Syncro ERP`,
        cuerpo:       `Hola ${cliente.nombre}, tu compra por $${venta.total} ha sido registrada.`,
        cuerpoHtml:   htmlConfirmacionVenta(venta, cliente),
      });
      this.logger.log(`Email venta #${venta.folio} → ${cliente.email}`);
    } catch (e: any) {
      this.logger.error(`Email venta #${venta.folio}: ${e?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CRÉDITO OTORGADO
  // ══════════════════════════════════════════════════════════════════════════
  async notificarCreditoOtorgado(venta: any, credito: any, cliente?: any): Promise<void> {
    if (!cliente?.email) return;
    try {
      await this.mailService.enviarCorreo({
        destinatario: cliente.email,
        asunto:       `💳 Crédito autorizado ${credito.folio} — Syncro ERP`,
        cuerpo:       `Hola ${cliente.nombre}, tu crédito por $${credito.montoTotal} ha sido aprobado.`,
        cuerpoHtml:   htmlCreditoOtorgado(venta, credito, cliente),
      });
      this.logger.log(`Email crédito ${credito.folio} → ${cliente.email}`);
    } catch (e: any) {
      this.logger.error(`Email crédito ${credito.folio}: ${e?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. RECORDATORIO CUOTA (llamado manualmente o por cron)
  // ══════════════════════════════════════════════════════════════════════════
  async notificarRecordatorioCuota(cuota: any, credito: any, cliente?: any): Promise<void> {
    if (!cliente?.email) return;
    try {
      await this.mailService.enviarCorreo({
        destinatario: cliente.email,
        asunto:       `🔔 Tu pago vence en 3 días — ${credito.folio}`,
        cuerpo:       `Recordatorio: tu cuota #${cuota.numeroCuota} vence el ${cuota.fechaVencimiento}.`,
        cuerpoHtml:   htmlRecordatorioCuota(cuota, credito, cliente),
      });
    } catch (e: any) {
      this.logger.error(`Email recordatorio cuota: ${e?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CUOTA VENCIDA
  // ══════════════════════════════════════════════════════════════════════════
  async notificarCuotaVencida(cuota: any, credito: any, cliente?: any, diasVencida = 0): Promise<void> {
    if (!cliente?.email) return;
    try {
      await this.mailService.enviarCorreo({
        destinatario: cliente.email,
        asunto:       `🚨 Pago vencido ${diasVencida} días — ${credito.folio}`,
        cuerpo:       `Tu cuota #${cuota.numeroCuota} lleva ${diasVencida} días vencida.`,
        cuerpoHtml:   htmlCuotaVencida(cuota, credito, cliente, diasVencida),
      });
    } catch (e: any) {
      this.logger.error(`Email cuota vencida: ${e?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ORDEN DE COMPRA AL PROVEEDOR
  // ══════════════════════════════════════════════════════════════════════════
  async notificarOrdenCompraProveedor(oc: any, proveedor: any): Promise<void> {
    if (!proveedor?.email) {
      this.logger.warn(`OC ${oc.id?.slice(0,8)}: proveedor sin email`);
      return;
    }
    try {
      await this.mailService.enviarCorreo({
        destinatario: proveedor.email,
        asunto:       `📦 Nueva Orden de Compra OC-${oc.id?.slice(0,8).toUpperCase()} — Syncro ERP`,
        cuerpo:       `Estimado ${proveedor.nombre}, has recibido una nueva orden de compra.`,
        cuerpoHtml:   htmlOrdenCompraProveedor(oc, proveedor),
      });
      this.logger.log(`Email OC → proveedor ${proveedor.email}`);
    } catch (e: any) {
      this.logger.error(`Email OC proveedor: ${e?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. STOCK BAJO (llamado cuando se detecta)
  // ══════════════════════════════════════════════════════════════════════════
  async notificarStockBajo(productos: any[], destinatarios: string[]): Promise<void> {
    if (!productos.length || !destinatarios.length) return;
    const emails = destinatarios.filter(Boolean).join(', ');
    try {
      await this.mailService.enviarCorreo({
        destinatario: emails,
        asunto:       `⚠️ Alerta: ${productos.length} producto(s) bajo el mínimo de stock`,
        cuerpo:       `${productos.length} productos requieren reabastecimiento urgente.`,
        cuerpoHtml:   htmlStockBajo(productos),
      });
      this.logger.log(`Email stock bajo → ${emails}`);
    } catch (e: any) {
      this.logger.error(`Email stock bajo: ${e?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. BIENVENIDA USUARIO NUEVO
  // ══════════════════════════════════════════════════════════════════════════
  async notificarUsuarioNuevo(usuario: any, passwordTemporal?: string): Promise<void> {
    if (!usuario?.email) return;
    try {
      await this.mailService.enviarCorreo({
        destinatario: usuario.email,
        asunto:       '🎉 Bienvenido a Syncro ERP — Tu cuenta está lista',
        cuerpo:       `Hola ${usuario.nombreCompleto}, tu cuenta ha sido creada. Email: ${usuario.email}`,
        cuerpoHtml:   htmlBienvenidaUsuario(usuario, passwordTemporal),
      });
      this.logger.log(`Email bienvenida → ${usuario.email}`);
    } catch (e: any) {
      this.logger.error(`Email bienvenida: ${e?.message}`);
    }
  }
}