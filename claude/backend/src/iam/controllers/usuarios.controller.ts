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
import { AceptarInvitacionDto } from '../dto/aceptar-invitacion.dto';
import { ConsultarInvitacionDto } from '../dto/consultar-invitacion.dto';
import { ActiveUser } from '../decorators/active-user.decorator';
// ⚠️ Ajusta la ruta a tus decoradores si es necesario
import { Public } from '../../iam/decorators/public.decorator';
import { SkipPermisos } from '../decorators/skip-permisos.decorator';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  crear(
    @Body() dto: CrearUsuarioDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('rol') rolSolicitante: string,
  ) {
    return this.usuariosService.crear(dto, empresaId, rolSolicitante);
  }

  // ── INVITACIÓN (rutas públicas: el invitado aún no tiene sesión) ──────────

  /** Versión segura: el token no se registra en la URL del servidor. */
  @Public()
  @Post('invitacion')
  obtenerInvitacionSegura(@Body() dto: ConsultarInvitacionDto) {
    return this.usuariosService.obtenerInvitacion(dto.token);
  }

  /**
   * POST /usuarios/aceptar-invitacion  { token, password }
   * El empleado define su contraseña y activa su cuenta.
   */
  @Public()
  @Post('aceptar-invitacion')
  aceptarInvitacion(@Body() dto: AceptarInvitacionDto) {
    return this.usuariosService.aceptarInvitacion(dto.token, dto.password);
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

  @SkipPermisos()
  @Get('me/preferencias')
  preferencias(@ActiveUser('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.usuariosService.obtenerPreferencias(id, empresaId);
  }

  @SkipPermisos()
  @Patch('me/preferencias')
  actualizarPreferencias(
    @Body() dto: ActualizarUsuarioDto,
    @ActiveUser('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.actualizarPreferencias(id, empresaId, dto);
  }

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
    @ActiveUser('rol') rolSolicitante: string,
  ) {
    return this.usuariosService.actualizar(
      id,
      dto,
      empresaId,
      rolSolicitante,
    );
  }

  @Patch(':id/estado')
  toggleActivo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioSolicitanteId: string,
    @ActiveUser('rol') rolSolicitante: string,
  ) {
    return this.usuariosService.toggleActivo(
      id,
      empresaId,
      usuarioSolicitanteId,
      rolSolicitante,
    );
  }
}
