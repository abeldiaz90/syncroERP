import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { PermisosDinamicosService } from '../services/permisos-dinamicos.service';
import { RegisterDto } from '../dto/register.dto';
import { ReenviarVerificacionDto } from '../dto/reenviar-verificacion.dto';
import { OnboardingPasoDto } from '../dto/onboarding-paso.dto';
import { LoginDto } from '../dto/login.dto';
import { VerificarEmailDto } from '../dto/verificar-email.dto';
import { RecuperarPasswordDto } from '../dto/recuperar-password.dto';
import { RestablecerPasswordDto } from '../dto/restablecer-password.dto';
import { Public } from '../../iam/decorators/public.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { esRolAdministrador } from '../utils/roles.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permisosService: PermisosDinamicosService,
    private readonly config: ConfigService,
  ) {}

  private exigirAutenticacionLocal() {
    if (this.config.get<string>('AUTH_MODE', 'keycloak') === 'keycloak') {
      throw new ForbiddenException(
        'Las altas y contraseñas se administran en Keycloak de SUMA',
      );
    }
  }

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    this.exigirAutenticacionLocal();
    return this.authService.registrarEmpresa(registerDto);
  }

  /** Permite comprobar que frontend y backend usan el mismo contrato de registro. */
  @Public()
  @Get('register/contrato')
  contratoRegistro() {
    return {
      version: '2026-07-31-v2-terminos',
      campos: [
        'nombreComercial',
        'nombreCompleto',
        'email',
        'password',
        'aceptaTerminos',
        'terminosVersion',
      ],
      requiereVerificacionCorreo: true,
    };
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    this.exigirAutenticacionLocal();
    return this.authService.login(loginDto);
  }

  /** El token viaja en el cuerpo; los enlaces nuevos lo guardan en el fragmento URL. */
  @Public()
  @Post('verificar-email')
  async verificarEmail(@Body() dto: VerificarEmailDto) {
    return this.authService.verificarEmail(dto.token);
  }

  /** POST /api/auth/reenviar-verificacion  { email } */
  @Public()
  @Post('reenviar-verificacion')
  async reenviarVerificacion(@Body() dto: ReenviarVerificacionDto) {
    return this.authService.reenviarVerificacion(dto.email);
  }

  /**
   * POST /api/auth/recuperar-password  { email }
   * Envía el enlace de restablecimiento. Respuesta siempre genérica
   * (no revela si el correo existe o no).
   */
  @Public()
  @Post('recuperar-password')
  async recuperarPassword(@Body() dto: RecuperarPasswordDto) {
    return this.authService.solicitarRecuperacion(dto.email);
  }

  /**
   * POST /api/auth/restablecer-password  { token, password }
   * Guarda la nueva contraseña. Token de un solo uso, expira en 1 h.
   */
  @Public()
  @Post('restablecer-password')
  async restablecerPassword(@Body() dto: RestablecerPasswordDto) {
    return this.authService.restablecerPassword(dto.token, dto.password);
  }

  /**
   * POST /api/auth/onboarding/paso/:numero
   * Guarda cada paso del wizard de configuración inicial.
   * Requiere JWT (@SkipPermisos: sin validar tabla de permisos).
   * El paso 4 marca onboardingCompletado = true.
   */
  @SkipPermisos()
  @Post('onboarding/paso/:numero')
  async onboardingPaso(
    @ActiveUser('empresaId') empresaId: string,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() datos: OnboardingPasoDto,
  ) {
    return this.authService.guardarPasoOnboarding(empresaId, numero, datos);
  }


  @SkipPermisos()
  @Get('onboarding/estado')
  async onboardingEstado(@ActiveUser('empresaId') empresaId: string) {
    return this.authService.obtenerEstadoOnboarding(empresaId);
  }

  @SkipPermisos()
  @Get('sesion')
  async sesion(
    @ActiveUser() usuario: Record<string, string>,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    const permisos = esRolAdministrador(rol)
      ? { '*': true }
      : await this.permisosService.obtenerPermisosPorRolParaFrontend(
          rol,
          empresaId,
        );
    return { usuario, permisos };
  }

  @SkipPermisos()
  @Post('logout')
  async logout(
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.authService.logout(usuarioId, empresaId);
  }

  /** GET /api/auth/mis-permisos — admin devuelve { "*": true } (acceso total explícito) */
  @SkipPermisos()
  @Get('mis-permisos')
  async misPermisos(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (esRolAdministrador(rol)) return { '*': true };
    return this.permisosService.obtenerPermisosPorRolParaFrontend(
      rol,
      empresaId,
    );
  }

  /** GET /api/auth/menu — árbol de menú filtrado por rol */
  @SkipPermisos()
  @Get('menu')
  async menu(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.permisosService.obtenerMenuParaRol(rol, empresaId);
  }
}
