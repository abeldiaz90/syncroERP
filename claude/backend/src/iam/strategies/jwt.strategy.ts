import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import jwksRsa = require('jwks-rsa');

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
  constructor(
    private configService: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {
    const modo = configService.get<string>('AUTH_MODE', 'keycloak');
    const issuer = configService.get<string>('KEYCLOAK_ISSUER_URL', '').replace(
      /\/$/,
      '',
    );
    const base = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    };

    super(
      modo === 'keycloak'
        ? {
            ...base,
            issuer,
            algorithms: ['RS256'],
            secretOrKeyProvider: jwksRsa.passportJwtSecret({
              cache: true,
              cacheMaxEntries: 5,
              cacheMaxAge: 10 * 60 * 1000,
              rateLimit: true,
              jwksRequestsPerMinute: 10,
              jwksUri: `${issuer}/protocol/openid-connect/certs`,
            }),
          }
        : {
            ...base,
            algorithms: ['HS256'],
            secretOrKey: configService.get<string>('JWT_SECRET'),
          },
    );
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
    const clientId = this.configService.getOrThrow<string>('KEYCLOAK_CLIENT_ID');
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

    let usuario = await this.usuarios.findOne({
      where: { keycloakSubject: payload.sub },
      relations: ['empresa'],
    });
    if (!usuario) {
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

    if (!usuario.keycloakSubject || !usuario.emailVerificado) {
      usuario.keycloakSubject = payload.sub;
      usuario.emailVerificado = payload.email_verified !== false;
      await this.usuarios.save(usuario);
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
