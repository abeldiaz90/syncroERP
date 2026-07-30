import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../../common/services/mail.service';
import { RegisterDto } from '../dto/register.dto';
import { exigirPoliticaPassword } from '../security/password-policy';

@Injectable()
export class RegisterService {
  private readonly logger = new Logger(RegisterService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  async registrar(dto: RegisterDto) {
    exigirPoliticaPassword(dto.password);

    const existe = await this.dataSource.query(
      'SELECT id FROM Usuarios WHERE email = @0',
      [dto.email.toLowerCase().trim()],
    );
    if (existe.length > 0)
      throw new ConflictException('Ya existe una cuenta con ese correo');

    const [empresa] = await this.dataSource.query(
      'INSERT INTO Empresas (nombreComercial, activo) OUTPUT INSERTED.id VALUES (@0, 0)',
      [dto.nombreComercial.trim()],
    );

    const hash = await bcrypt.hash(dto.password, 12);
    const token = crypto.randomBytes(32).toString('hex'); // ← correo
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex'); // ← BD
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.dataSource.query(
      'INSERT INTO Usuarios ' +
        '(empresaId, nombreCompleto, email, passwordHash, rol, emailVerificado, tokenVerificacion, tokenExpira) ' +
        'VALUES (@0,@1,@2,@3,@4,@5,@6,@7)',
      [
        empresa.id,
        dto.nombreCompleto.trim(),
        dto.email.toLowerCase().trim(),
        hash,
        'admin',
        0,
        tokenHash,
        expira,
      ],
    );

    const url = `${process.env.FRONTEND_URL}/verificar-email?token=${token}`;
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
        <h1 style="color:#0f172a;font-size:22px">¡Bienvenido a SyncroERP!</h1>
        <p style="color:#475569">Hola <strong>${dto.nombreComercial}</strong>,</p>
        <p style="color:#475569">Para activar tu cuenta confirma tu correo:</p>
        <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">
          Verificar mi correo
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">Expira en 24 horas.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:11px">SyncroERP · Sistema de Gestión Empresarial</p>
      </div>
    `;

    await this.mailService.enviarCorreo({
      destinatario: dto.email,
      asunto: `Verifica tu cuenta — ${dto.nombreComercial}`,
      cuerpo: `Verifica tu cuenta en: ${url}`,
      cuerpoHtml: html,
    });

    this.logger.log(`Email de verificación enviado a: ${dto.email}`);
    return { mensaje: 'Cuenta creada. Revisa tu correo para verificarla.' };
  }

  async verificarEmail(token: string) {
    const [usuario] = await this.dataSource.query(
      'SELECT id, empresaId, tokenExpira FROM Usuarios WHERE tokenVerificacion = @0 AND emailVerificado = 0',
      [
        crypto
          .createHash('sha256')
          .update(token || '')
          .digest('hex'),
      ],
    );
    if (!usuario) throw new NotFoundException('Token inválido o ya utilizado');
    if (new Date() > new Date(usuario.tokenExpira)) {
      throw new BadRequestException(
        'El enlace ha expirado. Solicita uno nuevo.',
      );
    }
    await this.dataSource.query(
      'UPDATE Usuarios SET emailVerificado=1, tokenVerificacion=NULL, tokenExpira=NULL WHERE id=@0',
      [usuario.id],
    );
    await this.dataSource.query('UPDATE Empresas SET activo=1 WHERE id=@0', [
      usuario.empresaId,
    ]);
    return { verificado: true, empresaId: usuario.empresaId };
  }

  async reenviarVerificacion(email: string) {
    const [usuario] = await this.dataSource.query(
      'SELECT id, nombreCompleto FROM Usuarios WHERE email=@0 AND emailVerificado=0',
      [email.toLowerCase()],
    );
    if (!usuario)
      throw new NotFoundException('No hay cuenta pendiente con ese correo');

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.dataSource.query(
      'UPDATE Usuarios SET tokenVerificacion=@0, tokenExpira=@1 WHERE id=@2',
      [token, expira, usuario.id],
    );

    const url = `${process.env.FRONTEND_URL}/verificar-email?token=${token}`;
    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: 'Nuevo enlace de verificación — SyncroERP',
      cuerpo: `Nuevo enlace: ${url}`,
      cuerpoHtml: `<div style="font-family:sans-serif;padding:32px">
        <h2 style="color:#0f172a">Nuevo enlace de verificación</h2>
        <p>Hola ${usuario.nombreCompleto}:</p>
        <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">
          Verificar mi correo
        </a>
        <p style="color:#94a3b8;font-size:12px">Expira en 24 horas.</p>
      </div>`,
    });
    return { mensaje: 'Nuevo enlace enviado. Revisa tu correo.' };
  }

  async guardarPasoOnboarding(empresaId: string, paso: number, datos: any) {
    switch (paso) {
      case 1:
        await this.dataSource.query(
          'UPDATE Empresas SET rfc=@0, regimenFiscal=@1, giro=@2, tamano=@3 WHERE id=@4',
          [datos.rfc, datos.regimenFiscal, datos.giro, datos.tamano, empresaId],
        );
        break;
      case 2:
        await this.dataSource.query(
          'UPDATE Empresas SET direccionFiscal=@0, ciudad=@1, estado=@2, codigoPostal=@3, pais=@4 WHERE id=@5',
          [
            datos.direccion,
            datos.ciudad,
            datos.estado,
            datos.codigoPostal,
            datos.pais || 'México',
            empresaId,
          ],
        );
        break;
      case 3:
        await this.dataSource.query(
          'INSERT INTO almacenes (empresaId, nombre, direccion, esPrincipal) VALUES (@0,@1,@2,1)',
          [empresaId, datos.nombre, datos.direccion || ''],
        );
        break;
      case 4:
        await this.dataSource.query(
          'UPDATE Empresas SET plan=@0, onboardingCompletado=1 WHERE id=@1',
          [datos.plan || 'trial', empresaId],
        );
        break;
    }
    return { ok: true, siguiente: paso + 1 };
  }
}
