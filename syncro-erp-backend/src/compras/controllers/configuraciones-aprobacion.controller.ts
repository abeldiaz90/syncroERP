import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ConfiguracionesAprobacionService } from '../services/configuraciones-aprobacion.service';
import { CrearConfiguracionAprobacionDto } from '../dto/crear-configuracion-aprobacion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('configuraciones-aprobacion')
export class ConfiguracionesAprobacionController {
  constructor(private readonly service: ConfiguracionesAprobacionService) {}

  @Post()
  crear(@Body() dto: CrearConfiguracionAprobacionDto, @ActiveUser('empresaId') empresaId: string) {
    return this.service.crear(dto, empresaId);
  }

  @Get(':departamentoId')
  obtenerPorDepartamento(
    @Param('departamentoId') departamentoId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.obtenerPorDepartamento(departamentoId, empresaId);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.eliminar(id, empresaId);
  }
}