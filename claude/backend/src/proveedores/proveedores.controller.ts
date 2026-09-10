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
import { ActualizarProveedorDto } from './actualizar-proveedor.dto';
import { ActiveUser } from './../iam/decorators/active-user.decorator';
import { ResolverHomologacionDto } from './resolver-homologacion.dto';

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

  @Get(':id')
  obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.proveedoresService.obtenerPorId(id, empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarProveedorDto,
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

  @Patch(':id/homologacion')
  resolverHomologacion(
    @Param('id') id: string,
    @Body() dto: ResolverHomologacionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.proveedoresService.resolverHomologacion(
      id,
      dto,
      empresaId,
      usuarioId,
      rol,
    );
  }
}
