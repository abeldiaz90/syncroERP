import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { EstadosService } from '../services/estados.service';
import { CrearEstadoDto } from '../dto/crear-estado.dto';

@Controller('catalogos/estados')
export class EstadosController {
  constructor(private readonly service: EstadosService) {}

  @Get()
  findByPais(
    @Query('paisId') paisId?: string,
    @Query('activos') activos?: string,
  ) {
    return this.service.findByPais(paisId, activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearEstadoDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CrearEstadoDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }
}