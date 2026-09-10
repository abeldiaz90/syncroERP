import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import * as bcrypt from 'bcrypt';
import { exigirPoliticaPassword } from '../security/password-policy';
import * as crypto from 'crypto';
import { CrearUsuarioDto } from '../dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
// ⚠️ Ajusta la ruta a tu MailService real (el mismo que usa AuthService)
import { MailService } from '../../common/services/mail.service';
import { esRolAdministrador } from '../utils/roles.util';

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    private readonly mailService: MailService,
  ) {}

  private get frontendUrl(): string {
    const url = process.env.FRONTEND_URL;
    if (!url) {
      this.logger.warn(
        'FRONTEND_URL no definida — usando http://localhost:3000',
      );
      return 'http://localhost:3000';
    }
    return url.replace(/\/$/, '');
  }


  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private validarCambioRol(
    rolActual: string | undefined,
    rolNuevo: string | undefined,
    rolSolicitante: string,
  ): void {
    if (!rolNuevo || rolNuevo === rolActual) return;
    if (!esRolAdministrador(rolSolicitante)) {
      throw new ForbiddenException(
        'Solo un administrador puede asignar o cambiar roles.',
      );
    }
  }

  async obtenerPreferencias(id: string, empresaId: string) {
    const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    return { idioma: usuario.idioma || 'es-MX', zonaHoraria: usuario.zonaHoraria || 'America/Mexico_City' };
  }

  async actualizarPreferencias(id: string, empresaId: string, dto: ActualizarUsuarioDto) {
    const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (dto.idioma) usuario.idioma = dto.idioma;
    if (dto.zonaHoraria) usuario.zonaHoraria = dto.zonaHoraria;
    await this.usuarioRepo.save(usuario);
    return { idioma: usuario.idioma, zonaHoraria: usuario.zonaHoraria };
  }

  private describirError(error: unknown): { msg: string; stack?: string } {
    if (error instanceof Error)
      return { msg: error.message, stack: error.stack };
    return { msg: String(error) };
  }

  private async enviarCorreoInvitacion(
    email: string,
    nombre: string,
    token: string,
    rol: string,
  ) {
    const url = `${this.frontendUrl}/aceptar-invitacion#token=${token}`;
    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: 'Te invitaron a SyncroERP — activa tu cuenta',
      cuerpo: `Has sido invitado a SyncroERP. Activa tu cuenta: ${url}`,
      cuerpoHtml: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#0f172a">Te damos la bienvenida a SyncroERP</h2>
          <p style="color:#475569">Hola ${nombre}:</p>
          <p style="color:#475569">
            Has sido invitado a unirte al equipo con el rol de <strong>${rol}</strong>.
            Para activar tu cuenta y crear tu contraseña, haz clic aquí:
          </p>
          <a href="${url}"
             style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;
                    border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">
            Activar mi cuenta
          </a>
          <p style="color:#94a3b8;font-size:12px">
            El enlace expira en 48 horas. Si no esperabas esta invitación, ignora este correo.
          </p>
          <p style="color:#cbd5e1;font-size:11px">
            Si el botón no funciona, copia esta dirección:<br/>${url}
          </p>
        </div>`,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREAR USUARIO — envía invitación por correo (sin contraseña)
  // ──────────────────────────────────────────────────────────────────────────
  async crear(
    dto: CrearUsuarioDto,
    empresaId: string,
    rolSolicitante: string,
  ) {
    this.validarCambioRol(undefined, dto.rol, rolSolicitante);
    const emailNorm = dto.email.toLowerCase().trim();

    const existe = await this.usuarioRepo.findOne({
      where: { email: emailNorm, empresaId },
    });
    if (existe)
      throw new ConflictException(
        'Ya existe un usuario con ese email en esta empresa.',
      );

    // Token de invitación (reutiliza los campos de verificación de la entidad)
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 h

    // Contraseña provisional aleatoria SOLO para satisfacer NOT NULL.
    // El usuario nunca la usa: define la suya al aceptar la invitación.
    const passwordProvisional = crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(passwordProvisional, 10);

    const usuario = this.usuarioRepo.create({
      empresaId,
      nombreCompleto: dto.nombreCompleto,
      email: emailNorm,
      rol: dto.rol ?? 'empleado',
      departamentoId: (dto as any).departamentoId ?? null,
      passwordHash, // ← nombre correcto de la columna (era el bug)
      activo: false, // se activa al aceptar la invitación
      emailVerificado: false,
      tokenVerificacion: this.hashToken(token),
      tokenExpira: expira,
    } as any);

    const guardado = await this.usuarioRepo.save(usuario);

    // Enviar invitación fuera del flujo crítico: si el correo falla, el
    // usuario queda creado y se puede reenviar la invitación.
    try {
      await this.enviarCorreoInvitacion(
        emailNorm,
        dto.nombreCompleto,
        token,
        dto.rol ?? 'empleado',
      );
    } catch (error) {
      const { msg, stack } = this.describirError(error);
      this.logger.error(
        `FALLO ENVÍO DE INVITACIÓN a ${emailNorm}: ${msg}`,
        stack,
      );
    }

    const {
      passwordHash: _,
      tokenVerificacion: __,
      ...resultado
    } = guardado as any;
    return {
      ...resultado,
      mensaje:
        'Usuario creado. Se envió una invitación por correo para que active su cuenta.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACEPTAR INVITACIÓN — el empleado define su contraseña
  // ──────────────────────────────────────────────────────────────────────────
  async aceptarInvitacion(token: string, nuevaPassword: string) {
    if (!token) throw new BadRequestException('Token no proporcionado');
    if (!nuevaPassword || nuevaPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }

    const usuario = await this.usuarioRepo.findOne({
      where: {
        tokenVerificacion: In([this.hashToken(token), token]),
      },
    });
    if (!usuario)
      throw new NotFoundException('Invitación inválida o ya utilizada');

    if (usuario.tokenExpira && new Date() > new Date(usuario.tokenExpira)) {
      throw new BadRequestException(
        'La invitación ha expirado. Pide que te reenvíen una nueva.',
      );
    }

    exigirPoliticaPassword(nuevaPassword);
    usuario.passwordHash = await bcrypt.hash(nuevaPassword, 10);
    usuario.activo = true;
    usuario.emailVerificado = true;
    usuario.tokenVerificacion = null;
    usuario.tokenExpira = null;
    usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;
    await this.usuarioRepo.save(usuario);

    return { mensaje: 'Cuenta activada. Ya puedes iniciar sesión.' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DATOS DE LA INVITACIÓN — para mostrar nombre/email en la página de aceptar
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerInvitacion(token: string) {
    if (!token) throw new BadRequestException('Token no proporcionado');
    const usuario = await this.usuarioRepo.findOne({
      where: {
        tokenVerificacion: In([this.hashToken(token), token]),
      },
    });
    if (!usuario)
      throw new NotFoundException('Invitación inválida o ya utilizada');
    if (usuario.tokenExpira && new Date() > new Date(usuario.tokenExpira)) {
      throw new BadRequestException('La invitación ha expirado.');
    }
    return {
      nombreCompleto: usuario.nombreCompleto,
      email: usuario.email,
      rol: usuario.rol,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REENVIAR INVITACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  async reenviarInvitacion(id: string, empresaId: string) {
    const usuario = await this.obtenerPorId(id, empresaId);
    if (usuario.activo) {
      throw new BadRequestException('Este usuario ya activó su cuenta.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    usuario.tokenVerificacion = this.hashToken(token);
    usuario.tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.usuarioRepo.save(usuario);

    await this.enviarCorreoInvitacion(
      usuario.email,
      usuario.nombreCompleto,
      token,
      usuario.rol,
    );
    return { mensaje: 'Invitación reenviada.' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAS
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const qb = this.usuarioRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.departamento', 'dep')
      .where('u.empresaId = :empresaId', { empresaId });

    if (soloActivos) qb.andWhere('u.activo = :activo', { activo: true });
    if (filtro) {
      qb.andWhere('(u.nombreCompleto LIKE :filtro OR u.email LIKE :filtro)', {
        filtro: `%${filtro}%`,
      });
    }
    return qb.orderBy('u.nombreCompleto', 'ASC').getMany();
  }

  async obtenerPorId(id: string, empresaId: string) {
    const u = await this.usuarioRepo.findOne({
      where: { id, empresaId },
      relations: ['departamento'],
    });
    if (!u) throw new NotFoundException('Usuario no encontrado.');
    return u;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR
  // ──────────────────────────────────────────────────────────────────────────
  async actualizar(
    id: string,
    dto: ActualizarUsuarioDto,
    empresaId: string,
    rolSolicitante: string,
  ) {
    const usuario = await this.obtenerPorId(id, empresaId);
    this.validarCambioRol(usuario.rol, dto.rol, rolSolicitante);

    let invalidaSesiones = false;
    if (dto.password) {
      exigirPoliticaPassword(dto.password);
      usuario.passwordHash = await bcrypt.hash(dto.password, 12);
      delete (dto as any).password;
      invalidaSesiones = true;
    }
    if (dto.rol && dto.rol !== usuario.rol) invalidaSesiones = true;

    Object.assign(usuario, dto);
    if (invalidaSesiones) {
      usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;
    }
    return this.usuarioRepo.save(usuario);
  }

  async toggleActivo(
    id: string,
    empresaId: string,
    usuarioSolicitanteId: string,
    rolSolicitante: string,
  ) {
    if (!esRolAdministrador(rolSolicitante)) {
      throw new ForbiddenException(
        'Solo un administrador puede activar o desactivar usuarios.',
      );
    }
    if (id === usuarioSolicitanteId) {
      throw new BadRequestException(
        'No puedes desactivar tu propia cuenta desde esta operación.',
      );
    }
    const usuario = await this.obtenerPorId(id, empresaId);
    if (usuario.esPropietario && usuario.activo) {
      throw new BadRequestException(
        'El propietario de la empresa no puede desactivarse.',
      );
    }
    usuario.activo = !usuario.activo;
    usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;
    return this.usuarioRepo.save(usuario);
  }
}
