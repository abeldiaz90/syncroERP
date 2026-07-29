/**
 * ============================================================================
 * SyncroERP · Filtro global de excepciones
 * ----------------------------------------------------------------------------
 * Antes, cualquier error no controlado salía como HTML de Express con el stack
 * completo: nombres de tabla, rutas del servidor y a veces la consulta SQL.
 * Aquí toda respuesta de error tiene la misma forma, el detalle técnico va al
 * log del servidor y al cliente sólo llega lo que necesita para actuar.
 * ============================================================================
 */

import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import type { Request, Response } from 'express';

interface RespuestaError {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  /** Identificador para cruzar el error del usuario con el log del servidor. */
  traza: string;
}

/** Códigos de SQL Server que sí conviene traducir para el usuario. */
const SQL_CONOCIDOS: Record<number, { estado: number; mensaje: string }> = {
  2601: { estado: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos.' },
  2627: { estado: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos.' },
  547:  { estado: HttpStatus.CONFLICT, mensaje: 'El registro está en uso por otro documento y no puede modificarse.' },
  8152: { estado: HttpStatus.BAD_REQUEST, mensaje: 'Alguno de los valores excede la longitud permitida.' },
  515:  { estado: HttpStatus.BAD_REQUEST, mensaje: 'Falta un campo obligatorio.' },
};

@Catch()
export class FiltroGlobalExcepciones implements ExceptionFilter {
  private readonly logger = new Logger('Excepcion');

  catch(excepcion: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const traza = Math.random().toString(36).slice(2, 10).toUpperCase();
    let estado = HttpStatus.INTERNAL_SERVER_ERROR;
    let mensaje: string | string[] = 'Ocurrió un error inesperado. Intenta de nuevo.';
    let etiqueta = 'Internal Server Error';

    if (excepcion instanceof HttpException) {
      estado = excepcion.getStatus();
      const cuerpo = excepcion.getResponse();
      if (typeof cuerpo === 'string') {
        mensaje = cuerpo;
      } else if (cuerpo && typeof cuerpo === 'object') {
        const c = cuerpo as { message?: string | string[]; error?: string };
        mensaje = c.message ?? excepcion.message;
        etiqueta = c.error ?? etiqueta;
      }
    } else if (excepcion instanceof EntityNotFoundError) {
      estado = HttpStatus.NOT_FOUND;
      mensaje = 'No se encontró el registro solicitado.';
      etiqueta = 'Not Found';
    } else if (excepcion instanceof QueryFailedError) {
      const numero = (excepcion as unknown as { number?: number }).number;
      const conocido = numero ? SQL_CONOCIDOS[numero] : undefined;
      estado = conocido?.estado ?? HttpStatus.INTERNAL_SERVER_ERROR;
      mensaje = conocido?.mensaje ?? 'No se pudo completar la operación en la base de datos.';
      etiqueta = 'Database Error';
    }

    if (estado >= 500) {
      etiqueta = etiqueta === 'Internal Server Error' ? etiqueta : etiqueta;
    }

    const usuario = (req as unknown as { user?: { sub?: string; empresaId?: string } }).user;

    // El detalle completo va al log, nunca al cliente.
    const nivel = estado >= 500 ? 'error' : 'warn';
    const linea =
      `[${traza}] ${req.method} ${req.originalUrl} → ${estado}` +
      (usuario?.sub ? ` · usuario ${usuario.sub}` : '') +
      (usuario?.empresaId ? ` · empresa ${usuario.empresaId}` : '');

    if (nivel === 'error') {
      this.logger.error(linea, excepcion instanceof Error ? excepcion.stack : String(excepcion));
    } else {
      this.logger.warn(`${linea} · ${Array.isArray(mensaje) ? mensaje.join(' | ') : mensaje}`);
    }

    const cuerpo: RespuestaError = {
      statusCode: estado,
      message: mensaje,
      error: etiqueta,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      traza,
    };

    res.status(estado).json(cuerpo);
  }
}
