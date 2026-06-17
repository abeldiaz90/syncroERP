import { 
  Injectable, CanActivate, ExecutionContext, ForbiddenException 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermisosDinamicosService } from '../../iam/services/permisos-dinamicos.service';
import { IS_PUBLIC_KEY } from '../../iam/decorators/public.decorator';
import { SKIP_PERMISOS_KEY } from '../../iam/decorators/skip-permisos.decorator';

@Injectable()
export class PermisoEndpointGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permisosService: PermisosDinamicosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ── 1. Rutas @Public() — sin JWT, sin permisos ──────────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // ── 2. Rutas @SkipPermisos() — con JWT, sin consulta a BD ───────
    // Úsalo en endpoints del sistema IAM que necesitan el usuario
    // pero no deben pasar por la tabla de permisos.
    // Ej: GET /auth/menu, GET /auth/mis-permisos
    const skipPermisos = this.reflector.getAllAndOverride<boolean>(SKIP_PERMISOS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipPermisos) return true;

    // ── 3. Verificar que el usuario esté autenticado ─────────────────
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.empresaId) {
      throw new ForbiddenException('Usuario no autenticado o sin empresa asociada');
    }

    // ── 4. Bypass para roles con acceso total ────────────────────────
    if (user.rol === 'SUPER_ADMIN' || user.rol === 'admin') return true;

    // ── 5. Validación dinámica contra BD ─────────────────────────────
    const metodo = request.method;
    const ruta = request.route?.path;

    if (!ruta) return false;

    const tieneAcceso = await this.permisosService.verificarPermiso(
      user.empresaId,
      user.rol,
      metodo,
      ruta,
    );

    if (!tieneAcceso) {
      console.warn(
        `⛔ Acceso bloqueado: Empresa ${user.empresaId} | Rol ${user.rol} | ${metodo} ${ruta}`
      );
      throw new ForbiddenException('No tienes permisos suficientes para esta acción');
    }

    return true;
  }
}