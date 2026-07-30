import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { UsuariosService } from '../services/usuarios.service';
import { CrearUsuarioDto } from '../dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
import { ActiveUser } from '../decorators/active-user.decorator';
// ⚠️ Ajusta la ruta a tus decoradores si es necesario
import { Public } from '../../iam/decorators/public.decorator';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  crear(
    @Body() dto: CrearUsuarioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.crear(dto, empresaId);
  }

  // ── INVITACIÓN (rutas públicas: el invitado aún no tiene sesión) ──────────

  /**
   * GET /usuarios/invitacion?token=xxx
   * Devuelve nombre/email/rol para mostrarlos en la página de aceptación.
   * Va ANTES de las rutas con :id para no confundir "invitacion" con un id.
   */
  @Public()
  @Get('invitacion')
  obtenerInvitacion(@Query('token') token: string) {
    return this.usuariosService.obtenerInvitacion(token);
  }

  /**
   * POST /usuarios/aceptar-invitacion  { token, password }
   * El empleado define su contraseña y activa su cuenta.
   */
  @Public()
  @Post('aceptar-invitacion')
  aceptarInvitacion(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.usuariosService.aceptarInvitacion(token, password);
  }

  /**
   * POST /usuarios/:id/reenviar-invitacion
   * Reenvía el correo de invitación (requiere sesión del admin).
   */
  @Post(':id/reenviar-invitacion')
  reenviarInvitacion(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.reenviarInvitacion(id, empresaId);
  }

  // ── CRUD normal (requiere sesión) ─────────────────────────────────────────

  @Get()
  obtenerTodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('filtro') filtro?: string,
    @Query('activos') activos?: string,
  ) {
    const soloActivos = activos !== 'false';
    return this.usuariosService.obtenerTodos(empresaId, filtro, soloActivos);
  }

  @Get(':id')
  obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.obtenerPorId(id, empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.actualizar(id, dto, empresaId);
  }

  @Patch(':id/estado')
  toggleActivo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.toggleActivo(id, empresaId);
  }
}
