import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermisosDinamicosService } from '../../iam/services/permisos-dinamicos.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_PERMISOS_KEY } from '../../iam/decorators/skip-permisos.decorator';
import { esRolAdministrador } from '../../iam/utils/roles.util';

@Injectable()
export class PermisoEndpointGuard implements CanActivate {
  private readonly logger = new Logger(PermisoEndpointGuard.name);
  constructor(private reflector: Reflector, private permisosService: PermisosDinamicosService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PERMISOS_KEY, [context.getHandler(), context.getClass()]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.empresaId) throw new ForbiddenException('Usuario no autenticado o sin empresa asociada');
    if (esRolAdministrador(user.rol)) return true;

    const metodo = String(request.method ?? '').toUpperCase();
    const routePath = request.route?.path;
    if (!routePath) {
      this.logger.warn(`Ruta no resoluble para permisos: ${metodo} ${request.originalUrl}`);
      throw new ForbiddenException('No fue posible validar el permiso de esta ruta');
    }
    const base = String(request.baseUrl ?? '').replace(/^\/api/, '').replace(/\/$/, '');
    const local = String(routePath).replace(/^\//, '');
    const rutaCompleta = `${base}/${local}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    const permitido = await this.permisosService.verificarPermiso(user.empresaId, user.rol, metodo, rutaCompleta);
    if (!permitido) {
      this.logger.warn(`Acceso bloqueado empresa=${user.empresaId} usuario=${user.id ?? 'N/D'} rol=${user.rol} ${metodo} ${rutaCompleta}`);
      throw new ForbiddenException('No tienes permisos suficientes para esta acción');
    }
    return true;
  }
}
