import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { Empresa } from '../entities/empresa.entity';
import { Usuario } from '../entities/usuario.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { PermisosDinamicosService } from './permisos-dinamicos.service';
import { MailService } from '../../common/services/mail.service';
// ⚠️ AJUSTA esta ruta a donde vive tu entidad Almacen
import { Almacen } from '../../catalogo/entities/almacen.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly permisosService: PermisosDinamicosService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) { }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════
  private get frontendUrl(): string {
    const url = process.env.FRONTEND_URL;
    if (!url) {
      this.logger.warn(
        'FRONTEND_URL no está definida en .env — usando http://localhost:3000',
      );
      return 'http://localhost:3000';
    }
    return url.replace(/\/$/, '');
  }

  private generarToken(horasVigencia = 24) {
    return {
      token: crypto.randomBytes(32).toString('hex'),
      expira: new Date(Date.now() + horasVigencia * 60 * 60 * 1000),
    };
  }

  /** Extrae mensaje y stack de un error `unknown` de forma segura (TS 4.4+) */
  private describirError(error: unknown): { msg: string; stack?: string } {
    if (error instanceof Error) {
      return { msg: error.message, stack: error.stack };
    }
    return { msg: String(error) };
  }

  private plantillaCorreo(
    titulo: string,
    nombre: string,
    url: string,
    textoBoton: string,
    vigencia: string,
  ) {
    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
        <h2 style="color:#0f172a">${titulo}</h2>
        <p style="color:#475569">Hola ${nombre}:</p>
        <a href="${url}"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">
          ${textoBoton}
        </a>
        <p style="color:#94a3b8;font-size:12px">
          El enlace expira en ${vigencia}. Si no solicitaste esto, ignora este correo.
        </p>
        <p style="color:#cbd5e1;font-size:11px">
          Si el botón no funciona, copia y pega esta dirección en tu navegador:<br/>${url}
        </p>
      </div>`;
  }

  private async enviarCorreoVerificacion(
    email: string,
    nombreCompleto: string,
    token: string,
    esReenvio = false,
  ) {
    const url = `${this.frontendUrl}/verificar-email?token=${token}`;
    const titulo = esReenvio
      ? 'Nuevo enlace de verificación'
      : 'Confirma tu correo para activar tu cuenta';

    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: `${titulo} — SyncroERP`,
      cuerpo: `${titulo}: ${url}`,
      cuerpoHtml: this.plantillaCorreo(
        titulo,
        nombreCompleto,
        url,
        'Verificar mi correo',
        '24 horas',
      ),
    });
  }

  private async enviarCorreoRecuperacion(
    email: string,
    nombreCompleto: string,
    token: string,
  ) {
    const url = `${this.frontendUrl}/restablecer-password?token=${token}`;
    const titulo = 'Restablece tu contraseña';

    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: `${titulo} — SyncroERP`,
      cuerpo: `${titulo}: ${url}`,
      cuerpoHtml: this.plantillaCorreo(
        titulo,
        nombreCompleto,
        url,
        'Crear nueva contraseña',
        '1 hora',
      ),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REGISTRO
  // ═══════════════════════════════════════════════════════════════════════
  async registrarEmpresa(registerDto: RegisterDto) {
    const { nombreComercial, nombreCompleto, email, password } = registerDto;
    const emailNorm = email.toLowerCase().trim();

    const usuarioExistente = await this.usuarioRepository.findOne({
      where: { email: emailNorm },
    });
    if (usuarioExistente) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const { token, expira } = this.generarToken(24);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let empresaId: string;
    try {
      const nuevaEmpresa = queryRunner.manager.create(Empresa, {
        nombreComercial,
      });
      const empresaGuardada = await queryRunner.manager.save(nuevaEmpresa);
      empresaId = empresaGuardada.id;

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const nuevoUsuario = queryRunner.manager.create(Usuario, {
        empresaId,
        nombreCompleto,
        email: emailNorm,
        passwordHash,
        rol: 'admin',
        emailVerificado: false,
        tokenVerificacion: token,
        tokenExpira: expira,
      });
      await queryRunner.manager.save(nuevoUsuario);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const { msg, stack } = this.describirError(error);
      this.logger.error(`Error al registrar empresa: ${msg}`, stack);
      throw new InternalServerErrorException(
        'Error al registrar la empresa, cambios revertidos',
      );
    } finally {
      await queryRunner.release();
    }

    // Correo FUERA de la transacción: si el SMTP falla, el registro se
    // conserva y el usuario puede usar "reenviar verificación".
    try {
      await this.enviarCorreoVerificacion(emailNorm, nombreCompleto, token);
    } catch (error) {
      const { msg, stack } = this.describirError(error);
      this.logger.error(
        `FALLO ENVÍO DE CORREO DE VERIFICACIÓN a ${emailNorm}: ${msg}`,
        stack,
      );
    }

    return {
      mensaje:
        'Cuenta creada. Revisa tu correo para verificarla y poder iniciar sesión.',
      empresaId,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VERIFICAR EMAIL (idempotente: reintentos con el mismo token no fallan;
  // evita el falso "token inválido" del doble useEffect de React Strict Mode)
  // ═══════════════════════════════════════════════════════════════════════
  async verificarEmail(token: string) {
    if (!token) throw new BadRequestException('Token no proporcionado');

    const usuario = await this.usuarioRepository.findOne({
      where: { tokenVerificacion: token },
    });

    if (!usuario) {
      throw new NotFoundException('Token inválido o ya utilizado');
    }

    if (usuario.emailVerificado) {
      return { verificado: true, empresaId: usuario.empresaId };
    }

    if (usuario.tokenExpira && new Date() > new Date(usuario.tokenExpira)) {
      throw new BadRequestException(
        'El enlace de verificación ha expirado. Solicita uno nuevo.',
      );
    }

    usuario.emailVerificado = true;
    await this.usuarioRepository.save(usuario);

    await this.empresaRepository.update(usuario.empresaId, { activo: true });

    return { verificado: true, empresaId: usuario.empresaId };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REENVIAR VERIFICACIÓN
  // ═══════════════════════════════════════════════════════════════════════
  async reenviarVerificacion(email: string) {
    const emailNorm = (email || '').toLowerCase().trim();

    const usuario = await this.usuarioRepository.findOne({
      where: { email: emailNorm, emailVerificado: false },
    });
    if (!usuario) {
      throw new NotFoundException('No hay cuenta pendiente con ese correo');
    }

    const { token, expira } = this.generarToken(24);
    usuario.tokenVerificacion = token;
    usuario.tokenExpira = expira;
    await this.usuarioRepository.save(usuario);

    await this.enviarCorreoVerificacion(
      emailNorm,
      usuario.nombreCompleto,
      token,
      true,
    );

    return { mensaje: 'Nuevo enlace enviado. Revisa tu correo.' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOLICITAR RECUPERACIÓN DE CONTRASEÑA
  // Siempre responde el mismo mensaje, exista o no la cuenta
  // (evita que un atacante descubra qué correos están registrados).
  // ═══════════════════════════════════════════════════════════════════════
  async solicitarRecuperacion(email: string) {
    const emailNorm = (email || '').toLowerCase().trim();
    const respuestaGenerica = {
      mensaje:
        'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.',
    };

    if (!emailNorm) return respuestaGenerica;

    const usuario = await this.usuarioRepository.findOne({
      where: { email: emailNorm },
    });
    if (!usuario) return respuestaGenerica;

    const { token, expira } = this.generarToken(1); // vigencia corta: 1 hora
    usuario.tokenRecuperacion = token;
    usuario.tokenRecuperacionExpira = expira;
    await this.usuarioRepository.save(usuario);

    try {
      await this.enviarCorreoRecuperacion(
        emailNorm,
        usuario.nombreCompleto,
        token,
      );
    } catch (error) {
      const { msg, stack } = this.describirError(error);
      this.logger.error(
        `FALLO ENVÍO DE CORREO DE RECUPERACIÓN a ${emailNorm}: ${msg}`,
        stack,
      );
    }

    return respuestaGenerica;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RESTABLECER CONTRASEÑA
  // ═══════════════════════════════════════════════════════════════════════
  async restablecerPassword(token: string, nuevaPassword: string) {
    if (!token) throw new BadRequestException('Token no proporcionado');
    if (!nuevaPassword || nuevaPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }

    const usuario = await this.usuarioRepository.findOne({
      where: { tokenRecuperacion: token },
    });
    if (!usuario) {
      throw new NotFoundException('Enlace inválido o ya utilizado');
    }

    if (
      usuario.tokenRecuperacionExpira &&
      new Date() > new Date(usuario.tokenRecuperacionExpira)
    ) {
      throw new BadRequestException(
        'El enlace ha expirado. Solicita uno nuevo.',
      );
    }

    const salt = await bcrypt.genSalt(10);
    usuario.passwordHash = await bcrypt.hash(nuevaPassword, salt);

    // Token de un solo uso: se invalida de inmediato
    usuario.tokenRecuperacion = null;
    usuario.tokenRecuperacionExpira = null;

    // Recuperar contraseña vía correo verifica implícitamente el correo
    usuario.emailVerificado = true;

    await this.usuarioRepository.save(usuario);

    return { mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ONBOARDING POR PASOS — cada paso del wizard guarda de inmediato
  // Paso 1: datos fiscales · Paso 2: domicilio · Paso 3: almacén ·
  // Paso 4: plan (cierra el onboarding)
  // ═══════════════════════════════════════════════════════════════════════
  async guardarPasoOnboarding(
    empresaId: string,
    numPaso: number,
    datos: Record<string, any>,
  ) {
    const empresa = await this.empresaRepository.findOne({
      where: { id: empresaId },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    switch (numPaso) {
      case 1: // Datos fiscales
        empresa.rfc = datos.rfc?.toUpperCase().trim() || empresa.rfc;
        empresa.regimenFiscal = datos.regimenFiscal || empresa.regimenFiscal;
        empresa.giro = datos.giro || empresa.giro;
        empresa.tamano = datos.tamano || empresa.tamano;
        break;

      case 2: // Domicilio fiscal
        empresa.direccion = datos.direccion?.trim() || empresa.direccion;
        empresa.ciudad = datos.ciudad?.trim() || empresa.ciudad;
        empresa.estado = datos.estado?.trim() || empresa.estado;
        empresa.codigoPostal =
          datos.codigoPostal?.trim() || empresa.codigoPostal;
        empresa.pais = datos.pais?.trim() || empresa.pais;
        break;

      case 3: {
        // Primer almacén — idempotente: si repiten el paso no se duplica
        const nombre = (datos.nombre || '').trim();
        if (nombre) {
          const almacenRepo = this.dataSource.getRepository(Almacen);
          const existe = await almacenRepo.findOne({
            where: { empresaId, nombre },
          });
          if (!existe) {
            await almacenRepo.save(
              almacenRepo.create({
                empresaId,
                nombre,
                ubicacion: datos.direccion?.trim() || undefined,
              }),
            );
          }
        }
        break;
      }

      case 4: // Plan — último paso con datos: cierra el onboarding
        empresa.plan = datos.plan || 'starter';
        empresa.onboardingCompletado = true;
        break;

      default:
        throw new BadRequestException(
          `Paso de onboarding inválido: ${numPaso}`,
        );
    }

    await this.empresaRepository.save(empresa);

    return {
      ok: true,
      paso: numPaso,
      onboardingCompletado: empresa.onboardingCompletado,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOGIN — exige correo verificado; informa si falta el onboarding
  // ═══════════════════════════════════════════════════════════════════════
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const usuario = await this.usuarioRepository.findOne({
      where: { email: email.toLowerCase().trim() },
      relations: ['empresa'],
    });

    if (!usuario) throw new UnauthorizedException('Credenciales inválidas');

    const isPasswordValid = await bcrypt.compare(
      password,
      usuario.passwordHash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Credenciales inválidas');

    if (!usuario.emailVerificado) {
      throw new UnauthorizedException(
        'Debes verificar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
      );
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('Tu cuenta está desactivada');
    }

    const empresaId = usuario.empresa?.id ?? usuario.empresaId;

    const permisos =
      usuario.rol === 'admin'
        ? {}
        : await this.permisosService.obtenerPermisosPorRolParaFrontend(
          usuario.rol,
          empresaId,
        );

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId,
    };

    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombreCompleto,
        rol: usuario.rol,
        empresaId,
        // El frontend usa esta bandera para redirigir a /onboarding tras el login
        onboardingCompletado: usuario.empresa?.onboardingCompletado ?? true,
      },
      permisos,
    };
  }
}