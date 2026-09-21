import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import { IdentidadEmpresaService } from '../services/identidad-empresa.service';
import jwksRsa = require('jwks-rsa');

/*
 * ══════════════════════════════════════════════════════════════════════════
 * Etapa 2: varios directorios, no uno
 * --------------------------------------------------------------------------
 * Antes esta estrategia fijaba UN emisor y UNA dirección de llaves al
 * construirse. Con un realm por empresa eso obliga a reiniciar el ERP cada
 * vez que se da de alta un cliente — que es justo lo que la automatización
 * existe para evitar.
 *
 * Ahora el emisor se decide POR TOKEN. Dos cuidados que no son opcionales:
 *
 *  1. El emisor se comprueba ANTES de ir por sus llaves. Si no, un token con
 *     `iss` apuntando a un servidor cualquiera nos haría llamar a ese
 *     servidor: un atacante elegiría a quién hacemos peticiones desde dentro.
 *  2. La firma se verifica con las llaves DE SU PROPIO emisor. Verificar con
 *     las llaves de otro realm sería dar por bueno lo que no lo es.
 *
 * Y se mantiene aceptado el emisor del entorno, siempre. Por eso este cambio
 * no puede dejar fuera a nadie que hoy entre: lo que había sigue valiendo, y
 * lo nuevo se suma.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Lee un JWT SIN verificarlo. Solo para saber a quién preguntarle. */
function leerSinVerificar(token: string): { kid?: string; iss?: string } {
  try {
    const partes = token.split('.');
    if (partes.length !== 3) return {};
    const json = (b64: string) =>
      JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    return { kid: json(partes[0])?.kid, iss: json(partes[1])?.iss };
  } catch {
    // Un token ilegible no es un error del sistema: es un token inválido.
    return {};
  }
}

interface TokenKeycloak {
  sub?: string;
  email?: string;
  preferred_username?: string;
  email_verified?: boolean;
  iss?: string;
  azp?: string;
  aud?: string | string[];
  empresaId?: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  /** Un cliente de llaves por emisor. No se rearma en cada petición. */
  private readonly clientesJwks = new Map<string, jwksRsa.JwksClient>();

  constructor(
    private configService: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    private readonly identidades: IdentidadEmpresaService,
  ) {
    const modo = configService.get<string>('AUTH_MODE', 'keycloak');
    const base = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    };

    /*
     * El proveedor necesita `this`, y `this` no existe antes de `super()`.
     * El contenedor se llena justo después: la primera petición ya lo
     * encuentra, porque llega mucho más tarde que el constructor.
     */
    const propio: { estrategia?: JwtStrategy } = {};

    super(
      modo === 'keycloak'
        ? {
            ...base,
            // El emisor NO se fija aquí: se comprueba por token, abajo y en
            // `validarKeycloak`. Fijarlo aquí es lo que ataba el ERP a un
            // solo realm.
            algorithms: ['RS256'],
            secretOrKeyProvider: (
              _peticion: unknown,
              tokenCrudo: string,
              listo: (err: Error | null, llave?: string) => void,
            ) => {
              void propio.estrategia
                ?.llaveDelEmisor(tokenCrudo)
                .then((llave) => listo(null, llave))
                .catch((error: Error) => listo(error));
            },
          }
        : {
            ...base,
            algorithms: ['HS256'],
            secretOrKey: configService.get<string>('JWT_SECRET'),
          },
    );

    propio.estrategia = this;
  }

  /**
   * La llave con la que se verifica ESTE token, traída de SU emisor.
   *
   * El orden importa y es la mitad de la seguridad de este archivo: primero se
   * comprueba que el emisor esté registrado, y solo entonces se le pide sus
   * llaves. Nunca al revés.
   */
  private async llaveDelEmisor(tokenCrudo: string): Promise<string> {
    const { kid, iss } = leerSinVerificar(tokenCrudo);
    if (!iss) throw new UnauthorizedException('El token no dice quién lo emitió');

    const emisor = iss.replace(/\/$/, '');
    if (!(await this.identidades.emisorAceptado(emisor))) {
      this.logger.warn(`Token rechazado: emisor no registrado (${emisor})`);
      throw new UnauthorizedException(
        'El token no proviene de un directorio reconocido por SUMA',
      );
    }

    let cliente = this.clientesJwks.get(emisor);
    if (!cliente) {
      cliente = jwksRsa({
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${emisor}/protocol/openid-connect/certs`,
      });
      this.clientesJwks.set(emisor, cliente);
    }

    const llave = await cliente.getSigningKey(kid);
    return llave.getPublicKey();
  }

  async validate(payload: TokenKeycloak) {
    if (this.configService.get<string>('AUTH_MODE', 'keycloak') === 'keycloak') {
      return this.validarKeycloak(payload);
    }

    if (!payload?.sub || !payload?.empresaId) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const usuario = await this.usuarios.findOne({
      where: { id: payload.sub, empresaId: payload.empresaId, activo: true },
      relations: ['empresa'],
    });
    if (
      !usuario ||
      !usuario.emailVerificado ||
      !usuario.empresa?.activo ||
      Number(payload.tokenVersion ?? -1) !== Number(usuario.tokenVersion ?? 0)
    ) {
      throw new UnauthorizedException(
        'La cuenta o la empresa están desactivadas',
      );
    }
    return {
      id: usuario.id,
      sub: usuario.id,
      email: usuario.email,
      empresaId: usuario.empresaId,
      rol: usuario.rol,
    };
  }

  private async validarKeycloak(payload: TokenKeycloak) {
    /*
     * ────────────────────────────────────────────────────────────────────────
     * El emisor, otra vez
     * ------------------------------------------------------------------------
     * Ya se comprobó al ir por las llaves, pero ahí se leyó el token SIN
     * verificar. Aquí la firma ya está comprobada, así que este `iss` es el de
     * verdad. Comprobarlo dos veces cuesta una consulta en memoria y cierra el
     * hueco de que alguien firme con un realm conocido un token que dice venir
     * de otro.
     * ────────────────────────────────────────────────────────────────────────
     */
    const emisor = (payload.iss ?? '').replace(/\/$/, '');
    const emisores = await this.identidades.emisoresAceptados();
    const empresaDelEmisor = emisores.get(emisor);
    if (!empresaDelEmisor) {
      throw new UnauthorizedException(
        'El token no proviene de un directorio reconocido por SUMA',
      );
    }

    /*
     * Para quién se emitió. Con un realm por empresa el cliente público puede
     * llamarse distinto en cada uno, así que la referencia sale de la identidad
     * de esa empresa y solo cae al entorno cuando el emisor ES el del entorno.
     */
    let clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID') ?? '';
    if (empresaDelEmisor !== 'entorno') {
      const identidad = await this.identidades.deEmpresa(empresaDelEmisor);
      clientId = identidad.clientIdPublico ?? clientId;
    }
    if (!clientId) {
      // Igual que antes: sin esto no se puede decidir, y decidir a ciegas
      // sería aceptar tokens de cualquier aplicación del realm.
      throw new UnauthorizedException(
        'El ERP no tiene declarado su cliente en el directorio',
      );
    }
    const audiencia = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.azp !== clientId && !audiencia.includes(clientId)) {
      throw new UnauthorizedException('El token no fue emitido para Syncro ERP');
    }

    const email = (payload.email ?? payload.preferred_username ?? '')
      .trim()
      .toLowerCase();
    if (!payload.sub || !email || !email.includes('@')) {
      throw new UnauthorizedException(
        'Keycloak no proporcionó una identidad con correo electrónico',
      );
    }

    /*
     * ────────────────────────────────────────────────────────────────────────
     * Cómo se resuelve quién eres y a qué empresa perteneces
     * ------------------------------------------------------------------------
     * Keycloak dice QUIÉN eres; el ERP dice DE QUIÉN eres. La empresa sale
     * siempre de la fila del ERP (`usuario.empresaId`), nunca del token: el
     * token no la trae y no debe traerla, porque entonces quien controlara el
     * directorio elegiría a qué cartera entrar.
     *
     * Hay dos formas de encontrar la fila y no son igual de fuertes:
     *
     *  1. Por `keycloakSubject`. Es el identificador inmutable del directorio.
     *     Una vez sellado, es la buena.
     *  2. Por correo. Solo sirve LA PRIMERA VEZ, para enganchar a alguien que
     *     ya está dado de alta en el ERP con la identidad que acaba de
     *     presentarse. Es un enganche por un dato que el ERP no controla.
     *
     * Por eso el camino 2 exige que el directorio haya VERIFICADO el correo.
     * Sin esa condición, cualquiera que pudiera registrarse en el realm con el
     * correo de un empleado —sin demostrar que es suyo— se llevaba su fila del
     * ERP, con su empresa y su rol, en el primer login. El sello es
     * irreversible (abajo se graba `keycloakSubject`), así que el robo sería
     * permanente.
     * ────────────────────────────────────────────────────────────────────────
     */
    let usuario = await this.usuarios.findOne({
      where: { keycloakSubject: payload.sub },
      relations: ['empresa'],
    });
    const enganchePorCorreo = !usuario;
    if (!usuario) {
      if (payload.email_verified !== true) {
        throw new UnauthorizedException(
          'SUMA todavía no ha verificado este correo. Verifícalo antes de entrar al ERP.',
        );
      }
      usuario = await this.usuarios
        .createQueryBuilder('usuario')
        .leftJoinAndSelect('usuario.empresa', 'empresa')
        .where('LOWER(usuario.email) = :email', { email })
        .getOne();
    }
    if (!usuario) {
      throw new UnauthorizedException(
        'Tu cuenta existe en SUMA, pero aún no está dada de alta en Syncro ERP',
      );
    }
    if (usuario.keycloakSubject && usuario.keycloakSubject !== payload.sub) {
      throw new UnauthorizedException(
        'El correo ya está vinculado con otra identidad de SUMA',
      );
    }
    if (!usuario.activo || !usuario.empresa?.activo) {
      throw new UnauthorizedException(
        'La cuenta o la empresa están desactivadas',
      );
    }

    /*
     * ────────────────────────────────────────────────────────────────────────
     * Cada empresa entra por su propia puerta
     * ------------------------------------------------------------------------
     * Que el emisor esté registrado dice que es de SUMA, no que sea EL DE ESTA
     * PERSONA. Sin esta comprobación, el realm de la empresa A podría emitir un
     * token con el correo de alguien de la empresa B y entrar a su cartera: al
     * administrador de un cliente le bastaría crear una cuenta con el correo de
     * un empleado de otro.
     *
     * La regla: si la empresa del usuario tiene identidad propia, el token
     * tiene que venir de ahí. Si no la tiene, vale el emisor del entorno, que
     * es la instalación compartida de hoy.
     * ────────────────────────────────────────────────────────────────────────
     */
    const identidadDelUsuario = await this.identidades.deEmpresa(
      usuario.empresaId,
    );
    if (identidadDelUsuario.origen === 'empresa') {
      if (identidadDelUsuario.emisor !== emisor) {
        this.logger.warn(
          `Token rechazado: ${usuario.email} pertenece a la empresa ${usuario.empresaId} (emisor ${identidadDelUsuario.emisor}) y el token viene de ${emisor}`,
        );
        throw new UnauthorizedException(
          'Este acceso no corresponde al directorio de tu empresa',
        );
      }
    } else if (empresaDelEmisor !== 'entorno') {
      this.logger.warn(
        `Token rechazado: ${usuario.email} no tiene realm propio y el token viene de ${emisor}`,
      );
      throw new UnauthorizedException(
        'Este acceso no corresponde al directorio de tu empresa',
      );
    }

    if (!usuario.keycloakSubject || !usuario.emailVerificado) {
      usuario.keycloakSubject = payload.sub;
      usuario.emailVerificado = payload.email_verified !== false;
      await this.usuarios.save(usuario);
      if (enganchePorCorreo) {
        // Queda rastro de la única operación que une las dos identidades.
        this.logger.log(
          `Identidad enlazada: ${usuario.email} (empresa ${usuario.empresaId}) ↔ sub ${payload.sub}`,
        );
      }
    }

    return {
      id: usuario.id,
      sub: usuario.id,
      keycloakSub: payload.sub,
      email: usuario.email,
      empresaId: usuario.empresaId,
      rol: usuario.rol,
      nombreCompleto: usuario.nombreCompleto,
    };
  }
}
