import { Body, Controller, Get, Post } from '@nestjs/common';
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

  /**
   * GET /api/auth/mis-permisos
   * @SkipPermisos — requiere JWT pero omite validación en tabla de permisos.
   * Admin devuelve {} vacío (señal de acceso total en el frontend).
   */
  @SkipPermisos()
  @Get('mis-permisos')
  async misPermisos(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (rol === 'admin' || rol === 'SUPER_ADMIN') return {};
    return this.permisosService.obtenerPermisosPorRolParaFrontend(rol, empresaId);
  }

  /**
   * GET /api/auth/menu
   * @SkipPermisos — requiere JWT pero omite validación en tabla de permisos.
   * Devuelve el árbol de menú filtrado por el rol para el sidebar dinámico.
   */
  @SkipPermisos()
  @Get('menu')
  async menu(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.permisosService.obtenerMenuParaRol(rol, empresaId);
  }
}