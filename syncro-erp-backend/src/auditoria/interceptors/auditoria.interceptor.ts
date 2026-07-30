import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError, throwError } from 'rxjs';

import { AuditoriaService } from '../services/auditoria.service';
import { AccionAuditoria } from '../entities/registro-auditoria.entity';
import { SIN_AUDITORIA } from '../decorators/sin-auditoria.decorator';

/**
 * AuditoriaInterceptor — registra AUTOMÁTICAMENTE toda escritura sobre las
 * rutas sensibles, sin ensuciar los servicios.
 *
 * Estrategia:
 *  · Solo intercepta métodos de escritura (POST/PUT/PATCH/DELETE).
 *  · Solo audita rutas cuyo primer segmento está en la lista blanca
 *    (RUTAS_AUDITABLES). Así no se llena de ruido (logins, lecturas...).
 *  · Deduce entidad, acción e id del registro a partir de la ruta/respuesta.
 *  · GET nunca se audita. @SinAuditoria() exime un endpoint puntual.
 *  · Nunca rompe la petición: si algo falla al auditar, la operación sigue.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  /**
   * Lista blanca: primer segmento de la ruta → nombre lógico de entidad.
   * Amplíala cuando quieras auditar más módulos.
   */
  private static readonly RUTAS_AUDITABLES: Record<string, string> = {
    productos: 'Producto',
    categorias: 'Categoria',
    catalogo: 'Catalogo',
    usuarios: 'Usuario',
    roles: 'Rol',
    permisos: 'Permiso',
    finanzas: 'Finanzas',
    polizas: 'Poliza',
    cuentas: 'CuentaContable',
    'cuentas-contables': 'CuentaContable',
    clientes: 'Cliente',
    proveedores: 'Proveedor',
    compras: 'Compra',
    ventas: 'Venta',
    almacenes: 'Almacen',
    cierre: 'CierreContable',
    'cierre-contable': 'CierreContable',
    creditos: 'Credito',
    empresas: 'Empresa',
  };

  constructor(
    private readonly auditoria: AuditoriaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const metodo: string = (req?.method ?? '').toUpperCase();

    // Solo escrituras
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
      return next.handle();
    }

    // Exención explícita
    const eximido = this.reflector.getAllAndOverride<boolean>(SIN_AUDITORIA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (eximido) return next.handle();

    // ¿Ruta en la lista blanca?
    const rutaCruda: string = req?.route?.path ?? req?.url ?? '';
    const entidad = this.entidadDeRuta(rutaCruda);
    if (!entidad) return next.handle();

    const user = req?.user ?? {};
    const accion = this.accionDeMetodoYRuta(metodo, rutaCruda);
    const endpoint =
      `${metodo} ${(req?.originalUrl ?? rutaCruda).split('?')[0]}`.substring(
        0,
        300,
      );
    const ip = (
      req?.headers?.['x-forwarded-for'] ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      ''
    )
      .toString()
      .split(',')[0]
      .trim()
      .substring(0, 60);
    const idDesdeRuta = req?.params?.id ?? null;
    const payload = this.soloEscritura(metodo) ? req?.body : null;

    const base = {
      empresaId: user?.empresaId ?? null,
      usuarioId: user?.id ?? null,
      usuarioEmail: user?.email ?? null,
      usuarioRol: user?.rol ?? null,
      accion,
      entidad,
      endpoint,
      ip,
    };

    return next.handle().pipe(
      tap((respuesta) => {
        // Intentar sacar el id del registro de la respuesta o de la ruta
        const registroId =
          idDesdeRuta ??
          respuesta?.id ??
          respuesta?.poliza ??
          respuesta?.original?.id ??
          respuesta?.data?.id ??
          null;

        void this.auditoria.registrar({
          ...base,
          registroId,
          valorNuevo: payload,
          resultado: 'OK',
        });
      }),
      catchError((err) => {
        // También se audita el intento fallido (quién intentó qué)
        void this.auditoria.registrar({
          ...base,
          registroId: idDesdeRuta,
          valorNuevo: payload,
          resultado: 'ERROR',
        });
        return throwError(() => err);
      }),
    );
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private entidadDeRuta(ruta: string): string | null {
    const limpia = ruta.replace(/^\/+/, '').replace(/^api\//, '');
    const segmentos = limpia.split('/').filter(Boolean);
    for (const seg of segmentos) {
      const clave = seg.toLowerCase();
      if (AuditoriaInterceptor.RUTAS_AUDITABLES[clave]) {
        // Si un segmento posterior es más específico, prefiérelo
        // (ej. finanzas/polizas → Poliza en vez de Finanzas)
        for (let i = segmentos.length - 1; i >= 0; i--) {
          const c = segmentos[i].toLowerCase();
          if (AuditoriaInterceptor.RUTAS_AUDITABLES[c]) {
            return AuditoriaInterceptor.RUTAS_AUDITABLES[c];
          }
        }
        return AuditoriaInterceptor.RUTAS_AUDITABLES[clave];
      }
    }
    return null;
  }

  private accionDeMetodoYRuta(metodo: string, ruta: string): AccionAuditoria {
    if (/cancelar/i.test(ruta)) return 'CANCELAR';
    switch (metodo) {
      case 'POST':
        return 'CREAR';
      case 'PUT':
      case 'PATCH':
        return 'ACTUALIZAR';
      case 'DELETE':
        return 'ELIMINAR';
      default:
        return 'ACCION';
    }
  }

  private soloEscritura(metodo: string): boolean {
    return ['POST', 'PUT', 'PATCH'].includes(metodo);
  }
}
