import { Controller, Get, Put, Body, Param, ForbiddenException } from '@nestjs/common';
import { PermisosDinamicosService } from '../services/permisos-dinamicos.service';
import { ActiveUser } from '../decorators/active-user.decorator';
import { SkipPermisos } from '../decorators/skip-permisos.decorator';

@Controller('admin/permisos')
export class AdminPermisosController {
  constructor(private readonly permisosService: PermisosDinamicosService) {}

  // ── Solo admin puede ver y editar el árbol completo ──────────────────────

  @Get('arbol')
  async obtenerArbol(@ActiveUser('rol') rol: string) {
    if (rol !== 'admin') throw new ForbiddenException();
    return this.permisosService.obtenerArbolPermisos();
  }

  @Get('roles')
  async listarRoles(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (rol !== 'admin') throw new ForbiddenException();
    return this.permisosService.obtenerRolesDisponibles(empresaId);
  }

  @Get('rol/:rol')
  async obtenerPermisosRol(
    @Param('rol') rolABuscar: string,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (rol !== 'admin') throw new ForbiddenException();
    return this.permisosService.obtenerPermisosPorRol(rolABuscar, empresaId);
  }

  @Put('rol/:rol')
  async actualizarPermisos(
    @Param('rol') rolAEditar: string,
    @Body() body: { permisos: Record<string, boolean> },
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (rol !== 'admin') throw new ForbiddenException();
    await this.permisosService.actualizarPermisos(rolAEditar, body.permisos, empresaId);
    return { message: 'Permisos actualizados' };
  }

  // ── Cualquier usuario autenticado puede consultar SUS PROPIAS rutas ───────
  // @SkipPermisos evita que el guard bloquee este endpoint para no-admins
  // Es seguro: solo devuelve las rutas del rol que viene en el JWT firmado

  @SkipPermisos()
  @Get('mis-rutas')
  async misRutas(
    @ActiveUser('rol')       rol:       string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    const rutas = await this.permisosService.obtenerRutasPermitidas(rol, empresaId);
    return { rutas };
  }
}