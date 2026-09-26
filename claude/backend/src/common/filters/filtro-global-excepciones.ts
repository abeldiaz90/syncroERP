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
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface RespuestaError {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  /** Identificador para cruzar el error del usuario con el log del servidor. */
  traza: string;
  /**
   * Lo que el servicio adjuntó al negarse, cuando adjuntó algo.
   *
   * Un servicio que lanza `ConflictException({ message, conceptos })` está
   * diciendo dos cosas: que no puede, y qué falta exactamente. Lo segundo se
   * perdía aquí. La póliza de nómina contestaba «faltan cuentas contables» y
   * traía la lista de cuáles; la lista no salía nunca del servidor, así que
   * quien tenía dieciséis cuentas mapeadas se quedaba adivinando.
   *
   * Sólo para 4xx. Un 5xx es un problema nuestro y su detalle se queda en el
   * log, como hasta ahora.
   */
  detalle?: Record<string, unknown>;
}

/**
 * Nombre estándar del código, para cuando la excepción no trae etiqueta.
 *
 * Una `ConflictException` construida con un objeto propio no incluye `error`,
 * así que la etiqueta se quedaba en su valor inicial —«Internal Server
 * Error»— y la respuesta salía contradiciéndose: `statusCode: 409` con
 * `error: "Internal Server Error"`. Quien diagnostica un fallo se va por el
 * camino equivocado: busca un error del servidor donde hay una regla de
 * negocio diciendo que no.
 */
const ETIQUETA_POR_CODIGO: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
};

/** Códigos de SQL Server que sí conviene traducir para el usuario. */
/**
 * ============================================================================
 * Errores de base de datos, traducidos
 * ----------------------------------------------------------------------------
 * Esta tabla estaba indexada por `number`, que es como reporta los errores el
 * driver de SQL Server. Al migrar a PostgreSQL —que los reporta en `code`, una
 * cadena como `23505`— la tabla dejó de coincidir con nada y **todos** los
 * errores de base de datos cayeron al 500 genérico «No se pudo completar la
 * operación en la base de datos».
 *
 * El costo no era teórico: un RFC duplicado, una cuenta en uso o un id mal
 * formado en la URL devolvían el mismo 500 indistinguible, así que la pantalla
 * no podía decirle al usuario qué corregir y el operador no tenía más remedio
 * que llamar a soporte.
 *
 * Se conservan los códigos de SQL Server porque el ERP todavía atiende
 * instalaciones con ese motor.
 * ============================================================================
 */
type TraduccionSql = { estado: number; mensaje: string };

const SQL_SERVER: Record<number, TraduccionSql> = {
  2601: { estado: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos.' },
  2627: { estado: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos.' },
  547: {
    estado: HttpStatus.CONFLICT,
    mensaje: 'El registro está en uso por otro documento y no puede modificarse.',
  },
  8152: {
    estado: HttpStatus.BAD_REQUEST,
    mensaje: 'Alguno de los valores excede la longitud permitida.',
  },
  515: { estado: HttpStatus.BAD_REQUEST, mensaje: 'Falta un campo obligatorio.' },
};

const POSTGRES: Record<string, TraduccionSql> = {
  /*
   * `22P02` es el que más se ve y el que peor se explicaba: ocurre cuando una
   * ruta como `/activos/registro` cae en un `@Get(':id')` y «registro» llega a
   * la consulta donde se esperaba un UUID. Es una petición mal formada, no una
   * falla del servidor, y responder 500 mandaba a revisar la base cuando lo
   * único incorrecto era la URL.
   */
  '22P02': {
    estado: HttpStatus.BAD_REQUEST,
    mensaje: 'El identificador o alguno de los valores no tiene el formato esperado.',
  },
  '23505': { estado: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos.' },
  '23503': {
    estado: HttpStatus.CONFLICT,
    mensaje: 'El registro está en uso por otro documento, o apunta a uno que ya no existe.',
  },
  '23502': { estado: HttpStatus.BAD_REQUEST, mensaje: 'Falta un campo obligatorio.' },
  '23514': {
    estado: HttpStatus.BAD_REQUEST,
    mensaje: 'Alguno de los valores no está entre los permitidos para ese campo.',
  },
  '22001': {
    estado: HttpStatus.BAD_REQUEST,
    mensaje: 'Alguno de los valores excede la longitud permitida.',
  },
  '22003': {
    estado: HttpStatus.BAD_REQUEST,
    mensaje: 'Alguna cifra excede el rango permitido por su columna.',
  },
  '40001': {
    estado: HttpStatus.CONFLICT,
    mensaje: 'Otra operación modificó los mismos datos al mismo tiempo. Vuelve a intentarlo.',
  },
  '40P01': {
    estado: HttpStatus.CONFLICT,
    mensaje: 'Dos operaciones se bloquearon entre sí. Vuelve a intentarlo.',
  },
  '57014': {
    estado: HttpStatus.REQUEST_TIMEOUT,
    mensaje: 'La consulta tardó demasiado y se canceló.',
  },
};
@Catch()
export class FiltroGlobalExcepciones implements ExceptionFilter {
  private readonly logger = new Logger('Excepcion');

  catch(excepcion: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const traza = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    let estado = HttpStatus.INTERNAL_SERVER_ERROR;
    let mensaje: string | string[] =
      'Ocurrió un error inesperado. Intenta de nuevo.';
    let etiqueta = 'Internal Server Error';
    let detalle: Record<string, unknown> | undefined;

    if (excepcion instanceof HttpException) {
      estado = excepcion.getStatus();
      const cuerpo = excepcion.getResponse();
      if (typeof cuerpo === 'string') {
        mensaje = cuerpo;
      } else if (cuerpo && typeof cuerpo === 'object') {
        const c = cuerpo as {
          message?: string | string[];
          error?: string;
          [clave: string]: unknown;
        };
        mensaje = c.message ?? excepcion.message;
        etiqueta = c.error ?? ETIQUETA_POR_CODIGO[estado] ?? etiqueta;
        // Lo que el servicio adjuntó además del mensaje: la lista de lo que
        // falta, el veredicto, el importe que no cuadra. Es el dato que
        // convierte «no se puede» en algo que alguien puede arreglar.
        if (estado < 500) {
          const extra = Object.fromEntries(
            Object.entries(c).filter(
              ([clave]) => !['message', 'error', 'statusCode'].includes(clave),
            ),
          );
          if (Object.keys(extra).length) detalle = extra;
        }
      }
    } else if (excepcion instanceof EntityNotFoundError) {
      estado = HttpStatus.NOT_FOUND;
      mensaje = 'No se encontró el registro solicitado.';
      etiqueta = 'Not Found';
    } else if (excepcion instanceof QueryFailedError) {
      const errorSql = excepcion as unknown as {
        number?: number;
        code?: string;
        driverError?: { message?: string; code?: string; number?: number };
        message?: string;
      };
      /*
       * El código vive en sitios distintos según el driver y según si TypeORM
       * envolvió el error: se buscan los cuatro lugares en vez de suponer uno.
       */
      const numero = errorSql.number ?? errorSql.driverError?.number;
      const codigo = errorSql.code ?? errorSql.driverError?.code;
      const conocido =
        (codigo ? POSTGRES[codigo] : undefined) ??
        (numero ? SQL_SERVER[numero] : undefined);
      estado = conocido?.estado ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const detalleSql =
        errorSql.driverError?.message ?? errorSql.message ?? '';
      const columnaNula =
        numero === 515 || codigo === '23502'
          ? detalleSql.match(/column ["']([^"']+)["']/i)?.[1]
          : undefined;
      /*
       * Una tabla que no existe casi siempre significa una migración sin
       * correr, y decirlo ahorra la cacería: el mensaje genérico manda a
       * sospechar de la consulta, de los permisos o del dato, cuando lo único
       * que falta es `db:migration:run`.
       */
      const tablaAusente = /relation ["']?([\w.]+)["']? does not exist/i.exec(detalleSql)?.[1];

      mensaje = columnaNula
        ? `No se pudo guardar porque el campo ${columnaNula} quedó vacío. Revisa la configuración relacionada.`
        : tablaAusente
          ? `La tabla ${tablaAusente} no existe en la base de datos. Falta correr las migraciones pendientes.`
          : (conocido?.mensaje ??
            'No se pudo completar la operación en la base de datos.');
      /*
       * `Database Error` sólo cuando lo es. Un `22P02` —un identificador mal
       * formado que llegó a la consulta— es una petición equivocada, y
       * etiquetarla como avería de la base manda a revisar el servidor cuando
       * lo único incorrecto era la URL. Que el error mienta sobre de quién es
       * la culpa cuesta la misma tarde que no tener mensaje.
       */
      etiqueta =
        conocido && conocido.estado < 500 ? 'Bad Request' : 'Database Error';
    }

    // Sin etiqueta propia y sin ser HttpException —un fallo de SQL, un error
    // suelto— se usa la del código, que al menos no miente.
    if (etiqueta === 'Internal Server Error' && estado < 500) {
      etiqueta = ETIQUETA_POR_CODIGO[estado] ?? etiqueta;
    }

    const usuario = (
      req as unknown as { user?: { sub?: string; empresaId?: string } }
    ).user;

    // El detalle completo va al log, nunca al cliente.
    const nivel = estado >= 500 ? 'error' : 'warn';
    const linea =
      `[${traza}] ${req.method} ${req.originalUrl} → ${estado}` +
      (usuario?.sub ? ` · usuario ${usuario.sub}` : '') +
      (usuario?.empresaId ? ` · empresa ${usuario.empresaId}` : '');

    if (nivel === 'error') {
      this.logger.error(
        linea,
        excepcion instanceof Error ? excepcion.stack : String(excepcion),
      );
    } else {
      this.logger.warn(
        `${linea} · ${Array.isArray(mensaje) ? mensaje.join(' | ') : mensaje}`,
      );
    }

    const cuerpo: RespuestaError = {
      statusCode: estado,
      message: mensaje,
      error: etiqueta,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      traza,
      ...(detalle ? { detalle } : {}),
    };

    res.status(estado).json(cuerpo);
  }
}
