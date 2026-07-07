// catalogo/controllers/unidades-medida.controller.ts
import { Controller, Post, Get, Patch, Param, Query, Body } from '@nestjs/common';
import { CrearUnidadMedidaDto } from '../dto/crear-unidad-medida.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { UnidadesMedidaService } from '../services/unidades-medida.service';

@Controller('catalogo/unidades-medida')
export class UnidadesMedidaController {
  constructor(private readonly unidadesService: UnidadesMedidaService) {}

  @Post()
  crear(
    @Body() dto: CrearUnidadMedidaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.unidadesService.crear(dto, empresaId);
  }

  /**
   * POST /catalogo/unidades-medida/precargar-estandar
   * Carga las unidades comunes (Pieza, Kg, Litro…) con su clave SAT.
   * Va ANTES de las rutas con :id para no confundirse con un id.
   */
  @Post('precargar-estandar')
  precargarEstandar(@ActiveUser('empresaId') empresaId: string) {
    return this.unidadesService.precargarEstandar(empresaId);
  }

  @Get()
  obtenerTodas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('soloActivas') soloActivas?: string,
  ) {
    return this.unidadesService.obtenerTodas(empresaId, soloActivas === 'true');
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: Partial<CrearUnidadMedidaDto>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.unidadesService.actualizar(id, dto, empresaId);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.unidadesService.cambiarEstado(id, empresaId);
  }
}