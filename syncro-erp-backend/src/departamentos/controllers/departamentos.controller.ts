import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { DepartamentosService } from '../services/departamentos.service';
import { CrearDepartamentoDto } from '../dto/crear-departamento.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('departamentos')
export class DepartamentosController {
  constructor(private readonly service: DepartamentosService) {}

  @Post()
  create(@Body() dto: CrearDepartamentoDto, @ActiveUser('empresaId') empresaId: string) {
    return this.service.create(dto, empresaId);
  }

  @Get()
  findAll(@ActiveUser('empresaId') empresaId: string) {
    return this.service.findAll(empresaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CrearDepartamentoDto>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.update(id, dto, empresaId);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.toggle(id, empresaId);
  }
}