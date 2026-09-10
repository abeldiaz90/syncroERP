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
import { FormasPagoService } from '../services/formas-pago.service';
import { CrearFormaPagoDto } from '../dto/crear-forma-pago.dto';
import { ActualizarFormaPagoDto } from '../dto/actualizar-forma-pago.dto';

@Controller('catalogos/formas-pago')
export class FormasPagoController {
  constructor(private readonly service: FormasPagoService) {}

  @Get()
  findAll(@Query('activos') activos?: string) {
    return this.service.findAll(activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearFormaPagoDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ActualizarFormaPagoDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.toggle(id);
  }
}
