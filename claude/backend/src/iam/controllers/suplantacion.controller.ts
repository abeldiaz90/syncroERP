import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { ActiveUser } from '../decorators/active-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { Usuario } from '../entities/usuario.entity';
import { esRolAdministrador } from '../utils/roles.util';
import {
  CABECERA_SUPLANTACION,
  suplantacionHabilitada,
} from '../suplantacion/suplantacion.constants';

/**
 * La pantalla de «Ver como». Sólo dos lecturas: si está encendido, y a quién
 * se puede ver. Encender y apagar no es una operación del servidor —es la
 * pantalla la que decide si manda la cabecera o no—, así que aquí no hay nada
 * que guardar ni ninguna sesión que abrir.
 */
/*
 * NO lleva `@SkipPermisos()`. Podría —son dos lecturas inofensivas— y sería un
 * error: una pantalla que se concede con una llave que tienen los trece roles
 * es una pantalla que abre y contesta que no. Aquí el endpoint entra en la
 * tabla de permisos como cualquier otro, así que el menú sólo se lo ofrece a
 * quien lo tiene concedido, y `@Roles` lo vuelve a negar por si acaso.
 */
@Controller('iam/suplantacion')
@Roles('ADMINISTRADOR')
export class SuplantacionController {
  private readonly logger = new Logger(SuplantacionController.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  @Get()
  estado(@ActiveUser() usuario: any) {
    return {
      habilitada: suplantacionHabilitada(this.config),
      puedeSuplantar:
        suplantacionHabilitada(this.config) &&
        esRolAdministrador(usuario?.rol),
      cabecera: CABECERA_SUPLANTACION,
      suplantando: usuario?.suplantacion
        ? {
            comoId: usuario.id,
            comoEmail: usuario.email,
            comoRol: usuario.rol,
            realEmail: usuario.suplantacion.realEmail,
          }
        : null,
    };
  }

  @Get('usuarios')
  async candidatos(@ActiveUser() usuario: any) {
    /*
     * Mientras se está viendo como otro, esto responde que no, y está bien que
     * así sea: `RolesGuard` mira el rol con el que se atiende la petición, que
     * es el del suplantado. Para cambiar de rol hay que dejar de serlo primero
     * —la franja de arriba lo hace en un clic—, y eso mantiene entero el
     * rastro: cada suplantación empieza y termina siendo uno mismo.
     */
    if (!esRolAdministrador(usuario?.rol)) {
      throw new ForbiddenException(
        'Sólo el administrador puede ver el ERP como otra persona.',
      );
    }
    if (!suplantacionHabilitada(this.config)) {
      throw new ForbiddenException(
        'Ver el ERP como otra persona está desactivado en esta instalación.',
      );
    }

    const empresaId = usuario?.empresaId;
    const filas = await this.usuarios.find({
      where: { empresaId, activo: true, id: Not(usuario.id) },
      order: { rol: 'ASC', nombreCompleto: 'ASC' },
    });

    return filas
      .filter((u) => !esRolAdministrador(u.rol))
      .map((u) => ({
        id: u.id,
        nombreCompleto: u.nombreCompleto,
        email: u.email,
        rol: u.rol,
      }));
  }
}
