import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ActiveUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    // Si pasamos un campo específico (ej. @ActiveUser('empresaId')), devuelve solo eso.
    // Si no, devuelve todo el objeto del usuario decodificado.
    return data ? user?.[data] : user;
  },
);