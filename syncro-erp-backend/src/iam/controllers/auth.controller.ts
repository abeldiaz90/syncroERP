import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { PermisosDinamicosService } from '../services/permisos-dinamicos.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Public } from '../../iam/decorators/public.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permisosService: PermisosDinamicosService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.registrarEmpresa(registerDto);
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /** GET /api/auth/verificar-email?token=xxxx — clic del correo de verificación */
  @Public()
  @Get('verificar-email')
  async verificarEmail(@Query('token') token: string) {
    return this.authService.verificarEmail(token);
  }

  /** POST /api/auth/reenviar-verificacion  { email } */
  @Public()
  @Post('reenviar-verificacion')
  async reenviarVerificacion(@Body('email') email: string) {
    return this.authService.reenviarVerificacion(email);
  }

  /**
   * POST /api/auth/recuperar-password  { email }
   * Envía el enlace de restablecimiento. Respuesta siempre genérica
   * (no revela si el correo existe o no).
   */
  @Public()
  @Post('recuperar-password')
  async recuperarPassword(@Body('email') email: string) {
    return this.authService.solicitarRecuperacion(email);
  }

  /**
   * POST /api/auth/restablecer-password  { token, password }
   * Guarda la nueva contraseña. Token de un solo uso, expira en 1 h.
   */
  @Public()
  @Post('restablecer-password')
  async restablecerPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.restablecerPassword(token, password);
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
    @Body() datos: Record<string, any>,
  ) {
    return this.authService.guardarPasoOnboarding(empresaId, numero, datos);
  }

  /** GET /api/auth/mis-permisos — admin devuelve {} (acceso total) */
  @SkipPermisos()
  @Get('mis-permisos')
  async misPermisos(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (rol === 'admin' || rol === 'SUPER_ADMIN') return {};
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