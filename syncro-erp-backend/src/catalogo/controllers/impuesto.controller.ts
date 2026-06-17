import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ImpuestoService } from '../services/impuesto.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('catalogo/impuestos')
export class ImpuestoController {
  constructor(private readonly impuestoService: ImpuestoService) {}

  @Get()
  findAll(@ActiveUser('empresaId') empresaId: string) {
    return this.impuestoService.findAll(empresaId);
  }

  @Post()
  create(
    @Body('nombre') nombre: string,
    @Body('porcentaje') porcentaje: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impuestoService.create(nombre, porcentaje, empresaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body('nombre') nombre: string,
    @Body('porcentaje') porcentaje: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impuestoService.update(id, nombre, porcentaje, empresaId);
  }

  @Patch(':id/estado')
  toggleStatus(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impuestoService.toggleStatus(id, empresaId);
  }
}