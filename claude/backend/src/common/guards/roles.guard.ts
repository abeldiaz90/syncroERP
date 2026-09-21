import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../iam/decorators/roles.decorator';
import { esRolAdministrador, normalizarRol } from '../../iam/utils/roles.util';

/**
 * ============================================================================
 * Que `@Roles(...)` signifique algo
 * ----------------------------------------------------------------------------
 * Había 47 anotaciones `@Roles('administrador', 'direccion')` repartidas por
 * los controladores de integración, conciliación, cobranza y validación, y
 * **ninguna se evaluaba**: el decorador guardaba la metadata y nadie la leía.
 * `ROLES_KEY` aparecía una sola vez en todo el repositorio, en su propia
 * definición. La única autorización real era la tabla de permisos por módulo.
 *
 * La consecuencia se medía: las plantillas dan a `credito` y a `direccion` el
 * módulo `integracion` en modo consulta, así que cualquier usuario con rol
 * `credito` podía llamar `GET /integracion/roles/diagnostico` —que devuelve los
 * correos de todos los usuarios y su estado en el core— y el resto de las
 * pantallas de administración de la integración. El código decía que eso era
 * sólo para administración y el sistema no lo cumplía.
 *
 * Dos decisiones de este guardia:
 *
 *  · **Compara con `normalizarRol`**, no por igualdad de cadenas. Las
 *    anotaciones se escribieron con tres estilos distintos a lo largo del
 *    tiempo (`'administrador'`, `'ADMIN'`, `'DIRECCION'`) y el rol en la base
 *    es un `varchar` que nadie garantiza en minúsculas. Comparar literalmente
 *    haría que encender esto dejara gente fuera por una mayúscula — el mismo
 *    error que ya costó una tarde en la consola.
 *  · **El administrador pasa siempre**, con la misma función que usa el guardia
 *    de permisos (`esRolAdministrador`). Si aquí se decidiera por otra vía,
 *    tendríamos dos definiciones de «administrador» y algún día una diría sí y
 *    la otra no.
 *
 * Es aditivo respecto a `PermisoEndpointGuard`: los dos tienen que decir sí.
 * Uno responde «¿este rol tiene este módulo?» y el otro «¿este endpoint es de
 * administración?». Son preguntas distintas y ninguna sustituye a la otra.
 * ============================================================================
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const exigidos = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [contexto.getHandler(), contexto.getClass()],
    );
    // Sin anotación no hay nada que exigir: manda la tabla de permisos.
    if (!exigidos?.length) return true;

    const peticion = contexto.switchToHttp().getRequest();
    const usuario = peticion?.user;
    /*
     * Sin usuario no se decide aquí. Puede ser una ruta @Public() —el webhook
     * del core, la comprobación de dirección— y en ese caso quien manda es
     * su propia comprobación de clave. Negar aquí rompería esas rutas; el
     * guardia de sesión ya negó antes lo que tenía que negar.
     */
    if (!usuario) return true;

    if (esRolAdministrador(usuario.rol)) return true;

    const mio = normalizarRol(usuario.rol);
    const permitidos = exigidos.map(normalizarRol);
    if (permitidos.includes(mio)) return true;

    this.logger.warn(
      `Acceso negado por rol: ${usuario.email ?? usuario.id} (${mio}) intentó ${
        peticion.method
      } ${peticion.route?.path ?? peticion.url}, que es de ${permitidos.join(', ')}`,
    );
    throw new ForbiddenException(
      'Esta operación es de administración y tu perfil no la incluye.',
    );
  }
}
