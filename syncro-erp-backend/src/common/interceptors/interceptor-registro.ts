/**
 * ============================================================================
 * SyncroERP · Registro de peticiones
 * ----------------------------------------------------------------------------
 * El proyecto sólo tenía `console.log` sueltos. Esto da una línea por petición
 * con método, ruta, estado, duración y usuario, y marca las que pasan de
 * 1.5 s para tener visibles los cuellos de botella (varios reportes hacen
 * agregaciones sin índice).
 * ============================================================================
 */

import {
  CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

const UMBRAL_LENTO_MS = 1500;

/** Rutas de alto volumen que no aportan nada en el log. */
const SILENCIADAS = [/^\/api\/salud/, /^\/uploads\//, /^\/swagger/];

@Injectable()
export class InterceptorRegistro implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();

    const req = contexto.switchToHttp().getRequest<Request>();
    const res = contexto.switchToHttp().getResponse<Response>();

    if (SILENCIADAS.some((r) => r.test(req.originalUrl))) return siguiente.handle();

    const inicio = Date.now();

    return siguiente.handle().pipe(
      tap({
        next: () => this.registrar(req, res.statusCode, Date.now() - inicio),
        // Los errores los reporta el filtro global; aquí sólo la duración.
        error: () => this.registrar(req, res.statusCode || 500, Date.now() - inicio),
      }),
    );
  }

  private registrar(req: Request, estado: number, ms: number) {
    const usuario = (req as unknown as { user?: { sub?: string } }).user?.sub;
    const linea = `${req.method} ${req.originalUrl} ${estado} · ${ms}ms${usuario ? ` · ${usuario.slice(0, 8)}` : ''}`;

    if (ms >= UMBRAL_LENTO_MS) this.logger.warn(`LENTA ${linea}`);
    else this.logger.log(linea);
  }
}
