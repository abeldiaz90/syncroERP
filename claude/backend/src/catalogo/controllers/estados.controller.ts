import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { exigirAdministradorDePlataforma } from '../utils/catalogo-global-access';
import { EstadosService } from '../services/estados.service';
import { CrearEstadoDto } from '../dto/crear-estado.dto';
import { ActualizarEstadoDto } from '../dto/actualizar-estado.dto';

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
  create(@Body() dto: CrearEstadoDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ActualizarEstadoDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.toggle(id);
  }
}
