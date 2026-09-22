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
import { DirectorioIdentidadService } from '../services/directorio-identidad.service';
import { ConfigService } from '@nestjs/config';
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
  constructor(private readonly usuariosService: UsuariosService,
    private readonly directorio: DirectorioIdentidadService,
    private readonly config: ConfigService,
  ) {}

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
  @Get('me')
  miContexto(@ActiveUser('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.usuariosService.obtenerMiContexto(id, empresaId);
  }

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

  /**
   * Si el ERP puede crear identidades, y con qué candado.
   *
   * La pantalla lo anuncia al cargar: sin provisionador, dar de alta a alguien
   * deja un pendiente manual, y quien lo hace tiene derecho a saberlo ANTES de
   * llenar el formulario, no después.
   */
  @Get('directorio')
  async estadoDirectorio() {
    /*
     * `configurado` sólo dice que las variables están puestas, y eso no
     * distingue el caso que de verdad se da: cuenta de servicio con
     * `view-users` y sin `manage-users`. El ERP lee el directorio sin
     * problema y revienta con 403 justo al guardar el alta, con el formulario
     * lleno y sin decir qué rol falta. El diagnóstico lee los permisos del
     * propio token, que es lo que Keycloak va a mirar.
     */
    const diagnostico = await this.directorio.diagnostico();
    return {
      configurado: this.directorio.configurado,
      motivo: this.directorio.motivoNoConfigurado,
      dominios: this.directorio.dominiosPermitidos,
      identidadEnDirectorio:
        this.config.get<string>('AUTH_MODE', 'keycloak') === 'keycloak',
      puedeLeer: diagnostico.puedeLeer,
      puedeCrear: diagnostico.puedeCrear,
      faltan: diagnostico.faltan,
      alcanzable: diagnostico.alcanzable,
      detalle: diagnostico.detalle,
    };
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
    // La versión saneada: la entidad cruda lleva el hash y el token de
    // invitación, y eso no viaja a un navegador.
    return this.usuariosService.obtenerPorIdPublico(id, empresaId);
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
