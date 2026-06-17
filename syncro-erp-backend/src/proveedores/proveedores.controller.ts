import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';
import { CrearProveedorDto } from './crear-proveedor.dto';
import { ActiveUser } from './../iam/decorators/active-user.decorator';

@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  crear(
    @Body() dto: CrearProveedorDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.proveedoresService.crear(dto, empresaId);
  }

  @Get()
  obtenerTodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('filtro') filtro?: string,
    @Query('activos') activos?: string,
  ) {
    const soloActivos = activos !== 'false';
    return this.proveedoresService.obtenerTodos(empresaId, filtro, soloActivos);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: Partial<CrearProveedorDto>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.proveedoresService.actualizar(id, dto, empresaId);
  }

  @Patch(':id/estado')
  toggleActivo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.proveedoresService.toggleActivo(id, empresaId);
  }
}