import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    if (!payload?.sub || !payload?.empresaId) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const usuario = await this.usuarios.findOne({
      where: { id: payload.sub, empresaId: payload.empresaId, activo: true },
      relations: ['empresa'],
    });
    if (!usuario || !usuario.emailVerificado || !usuario.empresa?.activo) {
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
}
