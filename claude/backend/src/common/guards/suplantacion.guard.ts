import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Usuario } from '../../iam/entities/usuario.entity';
import { esRolAdministrador } from '../../iam/utils/roles.util';
import {
  CABECERA_SUPLANTACION,
  suplantacionHabilitada,
} from '../../iam/suplantacion/suplantacion.constants';

/**
 * ============================================================================
 * El guardia que atiende al administrador como si fuera otro
 * ----------------------------------------------------------------------------
 * Va DESPUÉS de `JwtAuthGuard` —necesita la sesión ya verificada— y ANTES de
 * `PermisoEndpointGuard` y `RolesGuard`, que son los que tienen que ver al
 * usuario suplantado y no al administrador. Ése es todo el truco: los tres
 * controles de autorización no se enteran de nada, y por eso lo que se prueba
 * con esto es exactamente lo que le pasará a la persona de verdad.
 *
 * Sin cabecera no hace nada y no cuesta nada: ni una consulta.
 * ============================================================================
 */
@Injectable()
export class SuplantacionGuard implements CanActivate {
  private readonly logger = new Logger(SuplantacionGuard.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const peticion = context.switchToHttp().getRequest();
    const objetivoId = String(
      peticion?.headers?.[CABECERA_SUPLANTACION] ?? '',
    ).trim();
    if (!objetivoId) return true;

    if (!suplantacionHabilitada(this.config)) {
      /*
       * Se responde con el motivo y no con un silencio. Una instalación que
       * ignora la cabecera sin decirlo es la peor de las dos: quien prueba
       * cree estar viendo el ERP como almacenista y lo está viendo como
       * administrador, y se lleva a casa un «sí funciona» que no vale nada.
       */
      throw new ForbiddenException(
        'Ver el ERP como otra persona está desactivado en esta instalación.',
      );
    }

    const real = peticion?.user;
    if (!real?.id) {
      throw new UnauthorizedException(
        'No hay sesión con la que suplantar a nadie.',
      );
    }

    if (!esRolAdministrador(real.rol)) {
      throw new ForbiddenException(
        'Sólo el administrador puede ver el ERP como otra persona.',
      );
    }

    if (real.suplantacion) {
      // No puede ocurrir —este guardia corre una vez—, pero si algún día corre
      // dos, encadenar suplantaciones borraría el rastro de quién empezó.
      throw new ForbiddenException('No se pueden encadenar suplantaciones.');
    }

    /*
     * La empresa sale de la SESIÓN, no de la cabecera. Es lo que impide que
     * esto sirva para asomarse a la cartera de otro cliente: un id de usuario
     * de otra empresa simplemente no se encuentra.
     */
    const objetivo = await this.usuarios.findOne({
      where: { id: objetivoId, empresaId: real.empresaId },
      relations: ['empresa'],
    });

    if (!objetivo) {
      throw new NotFoundException(
        'Esa persona no existe en tu empresa.',
      );
    }
    if (objetivo.id === real.id) {
      throw new ForbiddenException('Ya estás viendo el ERP como tú mismo.');
    }
    if (!objetivo.activo || objetivo.empresa?.activo === false) {
      throw new ForbiddenException(
        'Esa cuenta está desactivada: verla no diría nada cierto sobre cómo entra.',
      );
    }
    if (esRolAdministrador(objetivo.rol)) {
      /*
       * La suplantación sólo BAJA de privilegio. Permitir administrador →
       * administrador no acota nada y sí serviría para diluir la auditoría:
       * dos administradores indistinguibles en la bitácora.
       */
      throw new ForbiddenException(
        'No se puede ver el ERP como otro administrador: esto sólo sirve para acotar autoridad, no para cambiarla de dueño.',
      );
    }

    peticion.user = {
      id: objetivo.id,
      sub: objetivo.id,
      email: objetivo.email,
      empresaId: objetivo.empresaId,
      rol: objetivo.rol,
      nombreCompleto: objetivo.nombreCompleto,
      suplantacion: {
        realId: real.id,
        realEmail: real.email,
        realRol: real.rol,
      },
    };

    const metodo = String(peticion?.method ?? '').toUpperCase();
    if (metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS') {
      // Las lecturas no se anuncian: serían miles. Lo que cambia datos, sí.
      this.logger.warn(
        `${real.email} está escribiendo como ${objetivo.email} (${objetivo.rol}): ` +
          `${metodo} ${String(peticion?.originalUrl ?? peticion?.url ?? '').split('?')[0]}`,
      );
    }

    return true;
  }
}
