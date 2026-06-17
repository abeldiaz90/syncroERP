import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { PaisesService } from '../services/paises.service';
import { CrearPaisDto } from '../dto/crear-pais.dto';

@Controller('catalogos/paises')
export class PaisesController {
  constructor(private readonly service: PaisesService) {}

  @Get()
  findAll(@Query('activos') activos?: string) {
    return this.service.findAll(activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearPaisDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CrearPaisDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }
}