import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ImpuestoService } from '../services/impuesto.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { GuardarImpuestoDto } from '../dto/impuesto-operaciones.dto';

@Controller('catalogo/impuestos')
export class ImpuestoController {
  constructor(private readonly impuestoService: ImpuestoService) {}

  @Get()
  findAll(@ActiveUser('empresaId') empresaId: string) {
    return this.impuestoService.findAll(empresaId);
  }

  /**
   * Precarga los impuestos estándar de México (IVA 16%, IVA 0%, Exento).
   * Idempotente: no duplica los que ya existan.
   * POST /api/catalogo/impuestos/precargar-estandar
   */
  @Post('precargar-estandar')
  precargarEstandar(@ActiveUser('empresaId') empresaId: string) {
    return this.impuestoService.precargarEstandar(empresaId);
  }

  @Post()
  create(
    @Body() dto: GuardarImpuestoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impuestoService.create(dto.nombre, dto.porcentaje, empresaId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: GuardarImpuestoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impuestoService.update(id, dto.nombre, dto.porcentaje, empresaId);
  }

  @Patch(':id/estado')
  toggleStatus(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.impuestoService.toggleStatus(id, empresaId);
  }
}
