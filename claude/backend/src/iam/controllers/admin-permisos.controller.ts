import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  ForbiddenException,
  Post,
} from '@nestjs/common';
import { PermisosDinamicosService } from '../services/permisos-dinamicos.service';
import { ActiveUser } from '../decorators/active-user.decorator';
import { SkipPermisos } from '../decorators/skip-permisos.decorator';
import { esRolAdministrador } from '../utils/roles.util';
import {
  ActualizarPermisosRolDto,
  AplicarPlantillaRolDto,
  AsignarModulosRolDto,
} from '../dto/admin-permisos.dto';

@Controller('admin/permisos')
export class AdminPermisosController {
  constructor(private readonly permisosService: PermisosDinamicosService) {}


  @Post('sincronizar')
  async sincronizar(@ActiveUser('rol') rol: string) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    await this.permisosService.sincronizarControladoresYEndpoints();
    const arbol = await this.permisosService.obtenerArbolPermisos();
    const totalEndpoints = arbol.reduce(
      (total, controlador) => total + (controlador.endpoints?.length ?? 0),
      0,
    );
    return {
      ok: true,
      controladores: arbol.length,
      endpoints: totalEndpoints,
      mensaje: 'Endpoints sincronizados con los controladores cargados en NestJS',
    };
  }

  // ── Solo admin puede ver y editar el árbol completo ──────────────────────

  @Get('arbol')
  async obtenerArbol(@ActiveUser('rol') rol: string) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerArbolPermisos();
  }

  @Get('roles')
  async listarRoles(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerRolesDisponibles(empresaId);
  }

  /**
   * Resumen por rol. Es lo primero que carga la pantalla de permisos: la lista
   * de roles con cuanta gente los trae y cuantas acciones tienen encendidas.
   * El arbol por endpoint sigue existiendo, pero ya no es la puerta de entrada.
   */
  @Get('resumen-roles')
  async resumenRoles(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerResumenRoles(empresaId);
  }

  // ── Administracion por modulo ────────────────────────────────────────────
  // Es la puerta principal: un rol atiende modulos. El detalle por endpoint
  // sigue existiendo debajo para los casos raros, pero ya no es por donde se
  // entra.

  /** Catalogo de modulos con cuantas acciones tiene cada uno. */
  @Get('modulos')
  async listarModulos(@ActiveUser('rol') rol: string) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerModulos();
  }

  /** Que tiene concedido un rol, modulo por modulo. */
  @Get('rol/:rol/modulos')
  async modulosDeRol(
    @Param('rol') rolABuscar: string,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerModulosDeRol(rolABuscar, empresaId);
  }

  /** Ajuste fino: las acciones de un modulo, agrupadas por seccion. */
  @Get('rol/:rol/modulo/:moduloId')
  async accionesDeModulo(
    @Param('rol') rolABuscar: string,
    @Param('moduloId') moduloId: string,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerAccionesDeModulo(
      rolABuscar,
      empresaId,
      moduloId,
    );
  }

  /** Guarda el acceso por modulo. Por defecto reemplaza: manda la foto entera. */
  @Put('rol/:rol/modulos')
  async guardarModulosDeRol(
    @Param('rol') rolAEditar: string,
    @Body() body: AsignarModulosRolDto,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.asignarModulosARol(
      rolAEditar,
      empresaId,
      body.accesos ?? {},
      body.modo ?? 'reemplazar',
    );
  }

  @Get('rol/:rol')
  async obtenerPermisosRol(
    @Param('rol') rolABuscar: string,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerPermisosPorRol(rolABuscar, empresaId);
  }

  @Put('rol/:rol')
  async actualizarPermisos(
    @Param('rol') rolAEditar: string,
    @Body() body: ActualizarPermisosRolDto,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    await this.permisosService.actualizarPermisos(
      rolAEditar,
      body.permisos,
      empresaId,
    );
    return { message: 'Permisos actualizados' };
  }

  // ── Cualquier usuario autenticado puede consultar SUS PROPIAS rutas ───────
  // @SkipPermisos evita que el guard bloquee este endpoint para no-admins
  // Es seguro: solo devuelve las rutas del rol que viene en el JWT firmado

  @SkipPermisos()
  @Get('mis-rutas')
  async misRutas(
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    const rutas = await this.permisosService.obtenerRutasPermitidas(
      rol,
      empresaId,
    );
    return { rutas };
  }

  @Get('plantillas')
  async obtenerPlantillas(@ActiveUser('rol') rol: string) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.obtenerPlantillasDisponibles();
  }

  /**
   * POST /admin/permisos/rol/:rol/aplicar-plantilla
   * Carga los permisos sugeridos para ese rol.
   * Body opcional: { modo: 'agregar' | 'reemplazar' }  (default 'agregar')
   */
  @Post('rol/:rol/aplicar-plantilla')
  async aplicarPlantilla(
    @Param('rol') rolAEditar: string,
    @Body() body: AplicarPlantillaRolDto,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    if (!esRolAdministrador(rol)) throw new ForbiddenException();
    return this.permisosService.aplicarPlantillaRol(
      rolAEditar,
      empresaId,
      body?.modo ?? 'agregar',
    );
  }
}
