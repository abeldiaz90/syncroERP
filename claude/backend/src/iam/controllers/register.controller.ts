import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { RegisterService } from '../services/register.service';
import { RegisterDto } from '../dto/register.dto';
import { Public } from '../../iam/decorators/public.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Public()
@SkipPermisos()
@Controller('auth')
export class RegisterController {
  constructor(private readonly svc: RegisterService) {}

  @Post('register')
  registrar(@Body() dto: RegisterDto) {
    return this.svc.registrar(dto);
  }

  @Get('verificar-email')
  verificarEmail(@Query('token') token: string) {
    return this.svc.verificarEmail(token);
  }

  @Post('reenviar-verificacion')
  reenviar(@Body('email') email: string) {
    return this.svc.reenviarVerificacion(email);
  }

  // Wizard — requiere JWT (usuario ya verificado)
  @Post('onboarding/paso/:paso')
  guardarPaso(
    @Param('paso') paso: string,
    @Body() datos: any,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.guardarPasoOnboarding(empresaId, Number(paso), datos);
  }
}
