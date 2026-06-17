import { Controller, Get, Put, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { PermisosDinamicosService } from '../services/permisos-dinamicos.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('admin/permisos')
// El PermisoEndpointGuard global ya debería estar protegiendo esto, pero está bien tener doble validación
export class AdminPermisosController {
  constructor(private readonly permisosService: PermisosDinamicosService) {}

  @Get('arbol')
  async obtenerArbol(@ActiveUser('rol') rol: string) {
    if (rol !== 'admin') throw new ForbiddenException();
    return this.permisosService.obtenerArbolPermisos(); // El árbol de rutas es global del sistema
  }

  @Get('rol/:rol')
  async obtenerPermisosRol(
    @Param('rol') rolABuscar: string, 
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string
  ) {
    if (rol !== 'admin') throw new ForbiddenException();
    return this.permisosService.obtenerPermisosPorRol(rolABuscar, empresaId);
  }

  @Put('rol/:rol')
  async actualizarPermisos(
    @Param('rol') rolAEditar: string,
    @Body() body: { permisos: Record<string, boolean> },
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string
  ) {
    if (rol !== 'admin') throw new ForbiddenException();
    await this.permisosService.actualizarPermisos(rolAEditar, body.permisos, empresaId);
    return { message: 'Permisos actualizados' };
  }

  @Get('roles')
  async listarRoles(@ActiveUser('rol') rol: string, @ActiveUser('empresaId') empresaId: string) {
    if (rol !== 'admin') throw new ForbiddenException();
    return this.permisosService.obtenerRolesDisponibles(empresaId);
  }
}