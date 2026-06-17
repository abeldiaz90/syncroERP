import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { FormasPagoService } from '../services/formas-pago.service';
import { CrearFormaPagoDto } from '../dto/crear-forma-pago.dto';

@Controller('catalogos/formas-pago')
export class FormasPagoController {
  constructor(private readonly service: FormasPagoService) {}

  @Get()
  findAll(@Query('activos') activos?: string) {
    return this.service.findAll(activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearFormaPagoDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CrearFormaPagoDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }
}