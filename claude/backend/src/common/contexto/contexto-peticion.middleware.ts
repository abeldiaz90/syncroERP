import { NextFunction, Request, Response } from 'express';
import { ContextoPeticionAlmacen } from './contexto-peticion';

interface UsuarioActivo {
  id?: string;
  empresaId?: string;
  rol?: string;
  email?: string;
  keycloakSub?: string;
  suplantacion?: { realId?: string; realEmail?: string; realRol?: string };
}

/**
 * Publica la identidad de la petición en el almacén asíncrono.
 *
 * Es una función de Express y no una clase con `NestMiddleware` a propósito. La
 * versión con `consumer.apply(...).forRoutes('*')` tumbaba el arranque: el
 * proyecto corre sobre Express 5, donde `'*'` dejó de ser un patrón válido y
 * `path-to-regexp` lo rechaza. Registrándolo con `app.use()` no hay patrón que
 * interpretar, y de paso no hace falta DI para algo que no depende de nada.
 *
 * Corre ANTES de que el guard resuelva `request.user`, así que el token se lee
 * del encabezado y los datos del usuario se exponen como getters perezosos:
 * para cuando un servicio consulta el contexto, el guard ya pasó.
 */
export function contextoPeticion(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const encabezado = req.headers.authorization ?? '';
  const token = encabezado.toLowerCase().startsWith('bearer ')
    ? encabezado.slice(7).trim()
    : undefined;

  const usuario = () => (req as { user?: UsuarioActivo }).user;

  const contexto = {};
  Object.defineProperties(contexto, {
    tokenBruto: { get: () => token, enumerable: true },
    usuarioId: { get: () => usuario()?.id, enumerable: true },
    empresaId: { get: () => usuario()?.empresaId, enumerable: true },
    rol: { get: () => usuario()?.rol, enumerable: true },
    email: { get: () => usuario()?.email, enumerable: true },
    keycloakSub: { get: () => usuario()?.keycloakSub, enumerable: true },
    /*
     * Bajo suplantación, `usuarioId` y `email` son los del SUPLANTADO —tiene
     * que ser así, los controles de autorización miran eso—. Quien de verdad
     * está actuando vive aquí, y sin esto la bitácora atribuía los cambios a
     * quien no fue.
     */
    suplantacion: { get: () => usuario()?.suplantacion, enumerable: true },
  });

  ContextoPeticionAlmacen.ejecutarCon(contexto, () => next());
}
