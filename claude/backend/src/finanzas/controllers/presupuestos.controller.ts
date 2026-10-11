import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import {
  CapturarPresupuestoDto,
  CrearPresupuestoDto,
} from '../dto/presupuesto.dto';
import { PresupuestosService } from '../services/presupuestos.service';

@Controller('finanzas/presupuestos')
export class PresupuestosController {
  constructor(private readonly servicio: PresupuestosService) {}

  @Get()
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('ejercicio') ejercicio?: string,
  ) {
    return this.servicio.listar(
      empresaId,
      ejercicio ? Number(ejercicio) : undefined,
    );
  }

  @Get(':id')
  obtener(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.servicio.obtener(id, empresaId);
  }

  /** Presupuesto contra real, que es para lo que existe todo lo demás. */
  @Get(':id/comparativo')
  comparativo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('mesDesde') mesDesde?: string,
    @Query('mesHasta') mesHasta?: string,
    @Query('centroCostoId') centroCostoId?: string,
  ) {
    return this.servicio.comparativo(id, empresaId, {
      mesDesde: mesDesde ? Number(mesDesde) : undefined,
      mesHasta: mesHasta ? Number(mesHasta) : undefined,
      centroCostoId,
    });
  }

  @Post()
  crear(
    @Body() dto: CrearPresupuestoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.crear(empresaId, dto);
  }

  @Post(':id/lineas')
  capturar(
    @Param('id') id: string,
    @Body() dto: CapturarPresupuestoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.capturar(id, empresaId, dto.lineas);
  }

  @Post(':id/aprobar')
  aprobar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.servicio.aprobar(id, empresaId, usuarioId);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.servicio.eliminar(id, empresaId);
  }
}
