import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { BancosService } from '../services/bancos.service';
import { CrearBancoDto } from '../dto/crear-banco.dto';
import { ActualizarBancoDto } from '../dto/actualizar-banco.dto';

@Controller('catalogos/bancos')
export class BancosController {
  constructor(private readonly service: BancosService) {}

  @Get()
  findAll(@Query('activos') activos?: string) {
    return this.service.findAll(activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearBancoDto) {
    return this.service.create(dto);
  }

  /** Recuperación manual opcional; el mismo proceso corre al iniciar. */
  @Post('restaurar-oficiales')
  restaurarOficiales() {
    return this.service.precargarOficiales();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ActualizarBancoDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }
}
