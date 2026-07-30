import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import {
  IniciarConciliacionDto,
  ResolverAreaConciliacionDto,
} from '../dto/conciliacion-financiera.dto';
import { ConciliacionFinancieraService } from '../services/conciliacion-financiera.service';

@Controller('finanzas/conciliacion-inicial')
export class ConciliacionFinancieraController {
  constructor(private readonly service: ConciliacionFinancieraService) {}

  @Get()
  obtener(@ActiveUser('empresaId') empresaId: string) {
    return this.service.obtenerActual(empresaId);
  }

  @Post('iniciar')
  iniciar(
    @Body() dto: IniciarConciliacionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.iniciar(empresaId, usuarioId, dto);
  }

  @Put(':id/areas/:area')
  resolver(
    @Param('id') id: string,
    @Param('area')
    area: 'CAJA' | 'BANCOS' | 'CLIENTES' | 'PROVEEDORES' | 'INVENTARIO',
    @Body() dto: ResolverAreaConciliacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.resolverArea(empresaId, id, area, dto);
  }

  @Post(':id/confirmar')
  confirmar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.confirmar(empresaId, id, usuarioId);
  }
}
