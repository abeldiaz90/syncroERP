import {
  Injectable,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      const detalle =
        (typeof info?.message === 'string' && info.message.trim()) ||
        (err instanceof Error && err.message.trim()) ||
        (typeof err?.message === 'string' && err.message.trim()) ||
        info?.constructor?.name ||
        err?.constructor?.name ||
        'sin identidad';
      this.logger.warn(`JWT rechazado: ${detalle}`);
      throw err || new UnauthorizedException('Sesión Keycloak inválida');
    }
    return user as TUser;
  }
}
