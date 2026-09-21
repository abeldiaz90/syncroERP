import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * ============================================================================
 * SyncroERP · Envío de correo
 * ----------------------------------------------------------------------------
 * El correo es un aviso, no una operación: si no sale, el negocio sigue. Por
 * eso `enviarCorreo` nunca lanza. Lo que SÍ cambió es cómo lo cuenta.
 *
 * Antes hacía `console.error('Error al enviar correo:', error)` con el objeto
 * Error completo. Sin credenciales SMTP configuradas —que es el estado normal
 * de un ambiente de trabajo— eso son veinte líneas de traza de pila por CADA
 * aviso: en una sola corrida del ciclo de compras salieron tres, y entre ellas
 * se perdía el error que de verdad detuvo la corrida.
 *
 * Un fallo de configuración no merece una traza de pila. Merece una línea que
 * diga qué falta. Y merece decirse UNA vez, no en cada envío: el aviso número
 * doscientos no aporta nada que no dijera el primero.
 * ============================================================================
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly configurado: boolean;
  /** Fallos ya reportados, para no repetir el mismo diagnóstico en cada envío. */
  private readonly yaAvisado = new Set<string>();

  constructor(private configService: ConfigService) {
    const usuario = this.configService.get<string>('MAIL_USER');
    const clave = this.configService.get<string>('MAIL_PASS');
    this.configurado = Boolean(usuario && clave);

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('MAIL_PORT', 587),
      secure: false,
      auth: { user: usuario, pass: clave },
    });

    if (!this.configurado) {
      this.logger.warn(
        'Correo sin configurar (faltan MAIL_USER y MAIL_PASS): los avisos no se envían. ' +
          'Las operaciones no se detienen por esto.',
      );
    }
  }

  /**
   * Envía un correo electrónico genérico.
   * @param opciones - Datos del correo.
   */
  async enviarCorreo(opciones: {
    destinatario: string;
    asunto: string;
    cuerpo: string; // texto plano
    cuerpoHtml?: string; // HTML opcional
  }): Promise<void> {
    /*
     * Sin credenciales ni se intenta: el intento solo produce un EAUTH y ruido.
     * Ya se avisó una vez al arrancar.
     */
    if (!this.configurado) return;

    const mailOptions = {
      from: this.configService.get<string>('MAIL_FROM', 'no-reply@erp.com'),
      to: opciones.destinatario,
      subject: opciones.asunto,
      text: opciones.cuerpo,
      html: opciones.cuerpoHtml || undefined,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.debug(`Correo enviado a ${opciones.destinatario}: ${info.messageId}`);
    } catch (error) {
      /*
       * Una línea por CLASE de fallo, no por envío. El aviso se pierde y el
       * negocio sigue: eso es deliberado y está dicho arriba.
       */
      const codigo = (error as { code?: string })?.code ?? 'DESCONOCIDO';
      const motivo = error instanceof Error ? error.message : String(error);
      if (!this.yaAvisado.has(codigo)) {
        this.yaAvisado.add(codigo);
        this.logger.warn(
          `No se pudo enviar correo (${codigo}): ${motivo}. ` +
            'Se omite el aviso y la operación continúa. Este mensaje no se repite.',
        );
      }
    }
  }
}
