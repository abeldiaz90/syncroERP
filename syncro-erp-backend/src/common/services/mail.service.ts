import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('MAIL_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  /**
   * Envía un correo electrónico genérico.
   * @param opciones - Datos del correo.
   */
  async enviarCorreo(opciones: {
    destinatario: string;
    asunto: string;
    cuerpo: string;         // texto plano
    cuerpoHtml?: string;    // HTML opcional
  }): Promise<void> {
    const mailOptions = {
      from: this.configService.get<string>('MAIL_FROM', 'no-reply@erp.com'),
      to: opciones.destinatario,
      subject: opciones.asunto,
      text: opciones.cuerpo,
      html: opciones.cuerpoHtml || undefined,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Correo enviado:', info.messageId);
    } catch (error) {
      console.error('Error al enviar correo:', error);
      // No lanzamos excepción para no detener el flujo de negocio
    }
  }
}