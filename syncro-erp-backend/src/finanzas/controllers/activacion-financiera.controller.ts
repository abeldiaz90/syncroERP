import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { GuardarActivacionFinancieraDto } from '../dto/activacion-financiera.dto';
import { ActivacionFinancieraService } from '../services/activacion-financiera.service';

@Controller('finanzas/activacion')
export class ActivacionFinancieraController {
  constructor(private readonly service: ActivacionFinancieraService) {}

  @Get('acceso')
  @SkipPermisos()
  acceso(@ActiveUser('empresaId') empresaId: string) {
    return this.service.acceso(empresaId);
  }

  @Get()
  estado(@ActiveUser('empresaId') empresaId: string) {
    return this.service.estado(empresaId);
  }

  @Put('pasos/:paso')
  guardarPaso(
    @Param('paso', ParseIntPipe) paso: number,
    @Body() dto: GuardarActivacionFinancieraDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.guardarPaso(empresaId, paso, dto);
  }

  @Post('simular')
  simular(@ActiveUser('empresaId') empresaId: string) {
    return this.service.simular(empresaId);
  }

  @Post('activar')
  activar(
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.activar(empresaId, usuarioId);
  }
}
