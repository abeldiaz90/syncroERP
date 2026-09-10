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
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { Empresa } from '../entities/empresa.entity';
import { Usuario } from '../entities/usuario.entity';
import { RegisterDto } from '../dto/register.dto';
import { OnboardingPasoDto } from '../dto/onboarding-paso.dto';
import { LoginDto } from '../dto/login.dto';
import { PermisosDinamicosService } from './permisos-dinamicos.service';
import { MailService } from '../../common/services/mail.service';
// ⚠️ AJUSTA esta ruta a donde vive tu entidad Almacen
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { exigirPoliticaPassword } from '../security/password-policy';
import { esRolAdministrador } from '../utils/roles.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // ── Protección contra fuerza bruta ──
  private static readonly MAX_INTENTOS = 5;
  private static readonly MINUTOS_BLOQUEO = 15;
  /** Hash bcrypt de un valor imposible: iguala el tiempo de respuesta
   *  cuando el correo no existe (evita enumeración por timing). */
  private static readonly DUMMY_HASH =
    '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZWa4o0eiN0GJsBOJZm0AqPzYyD1Wt6';

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly permisosService: PermisosDinamicosService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

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

  /** SHA-256 del token: en BD solo se guarda el hash. Si alguien lee la
   *  tabla, no puede usar los tokens (el claro solo viaja en el correo). */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generarToken(horasVigencia = 24) {
    const token = crypto.randomBytes(32).toString('hex');
    return {
      token, // ← va en el correo
      tokenHash: this.hashToken(token), // ← va en la BD
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
    const url = `${this.frontendUrl}/verificar-email#token=${token}`;
    const titulo = esReenvio
      ? 'Nuevo enlace de verificación'
      : 'Confirma tu correo para activar tu cuenta';

    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: `${titulo} — SyncroERP`,
      cuerpo: `${titulo}: ${url}`,
      cuerpoHtml: this.plantillaCorreo(
        titulo,
        nombreCompleto.trim(),
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

    exigirPoliticaPassword(password);

    const usuarioExistente = await this.usuarioRepository.findOne({
      where: { email: emailNorm },
    });
    if (usuarioExistente) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const { token, tokenHash, expira } = this.generarToken(24);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let empresaId: string;
    try {
      const nuevaEmpresa = queryRunner.manager.create(Empresa, {
        nombreComercial: nombreComercial.trim(),
        activo: false,
        onboardingCompletado: false,
        onboardingPaso: 0,
        terminosAceptadosEn: new Date(),
        terminosVersion: registerDto.terminosVersion,
      });
      const empresaGuardada = await queryRunner.manager.save(nuevaEmpresa);
      empresaId = empresaGuardada.id;

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const nuevoUsuario = queryRunner.manager.create(Usuario, {
        empresaId,
        nombreCompleto: nombreCompleto.trim(),
        email: emailNorm,
        passwordHash,
        rol: 'admin',
        esPropietario: true,
        tokenVersion: 0,
        emailVerificado: false,
        tokenVerificacion: tokenHash, // solo el hash toca la BD
        tokenExpira: expira,
      });
      await queryRunner.manager.save(nuevoUsuario);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      const { msg, stack } = this.describirError(error);
      this.logger.error(`Error al registrar empresa: ${msg}`, stack);

      const sqlNumber =
        error instanceof QueryFailedError
          ? Number((error as QueryFailedError & { driverError?: { number?: number } }).driverError?.number)
          : undefined;
      if (sqlNumber === 2601 || sqlNumber === 2627) {
        throw new ConflictException('El correo electrónico ya está registrado');
      }

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
      registroContrato: '2026-07-31-v2-terminos',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VERIFICAR EMAIL — idempotente, sin crear sesión automáticamente.
  // La sesión sólo se emite después de autenticar usuario y contraseña.
  // ═══════════════════════════════════════════════════════════════════════
  async verificarEmail(token: string) {
    if (!token) throw new BadRequestException('Token no proporcionado');

    const usuario = await this.usuarioRepository.findOne({
      where: { tokenVerificacion: this.hashToken(token) },
      relations: ['empresa'],
    });

    if (!usuario) {
      throw new NotFoundException('Token inválido o ya utilizado');
    }

    // Si NO estaba verificado, lo verificamos ahora
    if (!usuario.emailVerificado) {
      if (usuario.tokenExpira && new Date() > new Date(usuario.tokenExpira)) {
        throw new BadRequestException(
          'El enlace de verificación ha expirado. Solicita uno nuevo.',
        );
      }
      usuario.emailVerificado = true;
      usuario.tokenVerificacion = null;
      usuario.tokenExpira = null;
      await this.usuarioRepository.save(usuario);
      if (usuario.esPropietario) {
        await this.empresaRepository.update(usuario.empresaId, { activo: true });
      }
    }
    // La operación es idempotente: una repetición controlada no crea sesión.

    return {
      verificado: true,
      mensaje: 'Correo verificado correctamente. Inicia sesión para continuar.',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REENVIAR VERIFICACIÓN
  // ═══════════════════════════════════════════════════════════════════════
  async reenviarVerificacion(email: string) {
    const emailNorm = (email || '').toLowerCase().trim();

    const usuario = await this.usuarioRepository.findOne({
      where: { email: emailNorm, emailVerificado: false },
    });
    const respuesta = {
      mensaje:
        'Si existe una cuenta pendiente con ese correo, enviaremos un nuevo enlace de verificación.',
    };
    if (!usuario) return respuesta;

    const { token, tokenHash, expira } = this.generarToken(24);
    usuario.tokenVerificacion = tokenHash;
    usuario.tokenExpira = expira;
    await this.usuarioRepository.save(usuario);

    await this.enviarCorreoVerificacion(
      emailNorm,
      usuario.nombreCompleto,
      token,
      true,
    );

    return respuesta;
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

    const { token, tokenHash, expira } = this.generarToken(1); // vigencia corta: 1 hora
    usuario.tokenRecuperacion = tokenHash;
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
    exigirPoliticaPassword(nuevaPassword);

    const usuario = await this.usuarioRepository.findOne({
      where: { tokenRecuperacion: this.hashToken(token) },
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

    // Nueva contraseña = borrón y cuenta nueva para el bloqueo
    usuario.intentosFallidos = 0;
    usuario.bloqueadoHasta = null;
    usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;

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
    datos: OnboardingPasoDto,
  ) {
    const empresa = await this.empresaRepository.findOne({
      where: { id: empresaId },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    if (numPaso > Math.max(1, (empresa.onboardingPaso ?? 0) + 1)) {
      throw new BadRequestException(
        `Completa primero el paso ${(empresa.onboardingPaso ?? 0) + 1}`,
      );
    }

    switch (numPaso) {
      case 1: // Datos fiscales
        if (!datos.rfc || !datos.regimenFiscal || !datos.giro || !datos.tamano) {
          throw new BadRequestException('Completa todos los datos fiscales obligatorios');
        }
        empresa.rfc = datos.rfc.toUpperCase().trim();
        empresa.regimenFiscal = datos.regimenFiscal;
        empresa.giro = datos.giro;
        empresa.tamano = datos.tamano;
        break;

      case 2: // Domicilio fiscal
        if (!datos.direccion || !datos.ciudad || !datos.estado || !datos.codigoPostal || !datos.pais) {
          throw new BadRequestException('Completa todo el domicilio fiscal');
        }
        empresa.direccion = datos.direccion.trim();
        empresa.ciudad = datos.ciudad.trim();
        empresa.estado = datos.estado.trim();
        empresa.codigoPostal = datos.codigoPostal.trim();
        empresa.pais = datos.pais.trim();
        break;

      case 3: {
        // Primer almacén — idempotente: si repiten el paso no se duplica
        const nombre = (datos.nombre || '').trim();
        if (!nombre) {
          throw new BadRequestException('El nombre del almacén es obligatorio');
        }
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

      case 4: // Plan. La preparación operativa se valida en /configuracion/diagnostico.
        if (!datos.plan) throw new BadRequestException('Selecciona un plan');
        empresa.plan = datos.plan;
        empresa.onboardingCompletado = true;
        break;

      default:
        throw new BadRequestException(
          `Paso de onboarding inválido: ${numPaso}`,
        );
    }

    empresa.onboardingPaso = Math.max(empresa.onboardingPaso ?? 0, numPaso);
    empresa.onboardingActualizadoEn = new Date();
    await this.empresaRepository.save(empresa);

    return {
      ok: true,
      paso: numPaso,
      siguientePaso: Math.min(5, empresa.onboardingPaso + 1),
      onboardingCompletado: empresa.onboardingCompletado,
    };
  }

  async obtenerEstadoOnboarding(empresaId: string) {
    const empresa = await this.empresaRepository.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    return {
      pasoCompletado: empresa.onboardingPaso ?? 0,
      siguientePaso: Math.min(5, (empresa.onboardingPaso ?? 0) + 1),
      onboardingCompletado: empresa.onboardingCompletado,
      datos: {
        rfc: empresa.rfc,
        regimenFiscal: empresa.regimenFiscal,
        giro: empresa.giro,
        tamano: empresa.tamano,
        direccion: empresa.direccion,
        ciudad: empresa.ciudad,
        estado: empresa.estado,
        codigoPostal: empresa.codigoPostal,
        pais: empresa.pais,
        plan: empresa.plan,
      },
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

    if (!usuario) {
      // Comparación de cortesía: iguala el tiempo de respuesta con el de
      // un usuario real para no revelar qué correos existen (timing attack).
      await bcrypt.compare(password, AuthService.DUMMY_HASH);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // ── ¿Cuenta bloqueada por intentos fallidos? ──
    if (
      usuario.bloqueadoHasta &&
      new Date() < new Date(usuario.bloqueadoHasta)
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      usuario.passwordHash,
    );
    if (!isPasswordValid) {
      usuario.intentosFallidos = (usuario.intentosFallidos ?? 0) + 1;

      if (usuario.intentosFallidos >= AuthService.MAX_INTENTOS) {
        usuario.bloqueadoHasta = new Date(
          Date.now() + AuthService.MINUTOS_BLOQUEO * 60000,
        );
        usuario.intentosFallidos = 0;
        await this.usuarioRepository.save(usuario);
        this.logger.warn(
          `Cuenta bloqueada ${AuthService.MINUTOS_BLOQUEO} min por fuerza bruta: ${usuario.email}`,
        );
        throw new UnauthorizedException('Credenciales inválidas');
      }

      await this.usuarioRepository.save(usuario);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // ── Login correcto: limpiar el contador si había fallos previos ──
    if (usuario.intentosFallidos > 0 || usuario.bloqueadoHasta) {
      usuario.intentosFallidos = 0;
      usuario.bloqueadoHasta = null;
      await this.usuarioRepository.save(usuario);
    }

    if (
      !usuario.emailVerificado ||
      !usuario.activo ||
      !usuario.empresa?.activo
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const empresaId = usuario.empresa?.id ?? usuario.empresaId;

    const permisos =
      esRolAdministrador(usuario.rol)
        ? { '*': true }
        : await this.permisosService.obtenerPermisosPorRolParaFrontend(
            usuario.rol,
            empresaId,
          );

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      empresaId,
      tokenVersion: Number(usuario.tokenVersion ?? 0),
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

  async logout(usuarioId: string, empresaId: string) {
    const resultado = await this.usuarioRepository.increment(
      { id: usuarioId, empresaId },
      'tokenVersion',
      1,
    );
    if (!resultado.affected) {
      throw new UnauthorizedException('Sesión inválida');
    }
    return { mensaje: 'Sesión cerrada correctamente.' };
  }

}
