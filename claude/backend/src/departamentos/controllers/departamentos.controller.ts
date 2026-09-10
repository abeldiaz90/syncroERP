import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { DepartamentosService } from '../services/departamentos.service';
import { ActualizarDepartamentoDto } from '../dto/actualizar-departamento.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('departamentos')
export class DepartamentosController {
  constructor(private readonly service: DepartamentosService) {}

  @Get()
  findAll(@ActiveUser('empresaId') empresaId: string) {
    return this.service.findAll(empresaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ActualizarDepartamentoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.update(id, dto, empresaId);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.toggle(id, empresaId);
  }
}
