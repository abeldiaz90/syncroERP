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

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Aquí ya no se dan de alta empresas
   * --------------------------------------------------------------------------
   * Había un alta pública: cualquiera con la dirección creaba una empresa y se
   * quedaba de administrador de ella, con su correo por verificar y un asistente
   * de puesta en marcha. Eso tenía sentido cuando el ERP se vendía solo; ahora
   * quien decide qué empresa existe y qué contrata es SUMA, desde su consola, y
   * el alta entra por la puerta de aprovisionamiento —clave de servicio, no
   * sesión de persona— en `AltaEmpresasController`.
   *
   * Dejar las dos puertas abiertas significaba que una empresa podía nacer sin
   * pasar por la consola: sin plan contratado, sin inquilino, sin identidad en
   * el directorio y sin que SUMA supiera que existe. Se quitó el alta pública,
   * su verificación de correo y su asistente.
   * ──────────────────────────────────────────────────────────────────────────
   */

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    this.exigirAutenticacionLocal();
    return this.authService.login(loginDto);
  }

  /*
   * ──────────────────────────────────────────────────────────────────────────
   * Aquí ya no se administran contraseñas
   * --------------------------------------------------------------------------
   * Había cuatro rutas públicas más: `verificar-email`,
   * `reenviar-verificacion`, `recuperar-password` y `restablecer-password`.
   * Se retiraron el 25-sep-2026 porque la identidad vive en Keycloak y allí se
   * entra, se recupera y se cambia la contraseña. Mantenerlas aquí era tener
   * dos sistemas de contraseñas donde sólo uno autentica.
   *
   * Lo que las delataba no era que existieran, sino QUE NADIE LAS MIRABA. Este
   * controlador ya tenía `exigirAutenticacionLocal()` —la guarda que niega el
   * acceso local cuando la identidad está en el directorio— y la llamaba
   * exactamente una ruta, `login`. Las otras cuatro se quedaron sin ella. Una
   * guarda escrita y no invocada es peor que ninguna: quien la lee cree que el
   * archivo está protegido.
   *
   * El daño concreto que hacían en modo directorio:
   *
   *   `recuperar-password` mandaba un correo de verdad, sin sesión, para
   *   restablecer una contraseña que no autentica nada.
   *
   *   `restablecer-password` sobrescribía el marcador
   *   `sin-acceso-local:identidad-en-el-directorio` con un hash real. No
   *   concedía acceso —la estrategia JWT sólo admite RS256 de un emisor
   *   registrado— pero dejaba la cuenta con una contraseña puesta por quien
   *   corriera el flujo, lista para el día que alguien cambiara el modo.
   *
   * Los métodos del servicio siguen existiendo y ahora comprueban el modo
   * ellos mismos: si alguien vuelve a colgar una ruta de ellos, se cierra sola.
   * ──────────────────────────────────────────────────────────────────────────
   */

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
