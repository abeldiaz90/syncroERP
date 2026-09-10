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
import { PaisesService } from '../services/paises.service';
import { CrearPaisDto } from '../dto/crear-pais.dto';
import { ActualizarPaisDto } from '../dto/actualizar-pais.dto';

@Controller('catalogos/paises')
export class PaisesController {
  constructor(private readonly service: PaisesService) {}

  @Get()
  findAll(@Query('activos') activos?: string) {
    return this.service.findAll(activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearPaisDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ActualizarPaisDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.toggle(id);
  }
}
