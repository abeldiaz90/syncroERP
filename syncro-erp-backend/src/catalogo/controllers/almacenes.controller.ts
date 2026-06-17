import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import { AlmacenesService } from '../services/almacenes.service';
import { CrearAlmacenDto } from '../dto/crear-almacen.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('catalogo/almacenes')
export class AlmacenesController {
  constructor(private readonly almacenesService: AlmacenesService) {}

  @Post()
  async crear(
    @Body() dto: CrearAlmacenDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.almacenesService.crearAlmacen(dto, empresaId);
  }

  @Get()
  async obtenerTodos(@ActiveUser('empresaId') empresaId: string) {
    return this.almacenesService.obtenerAlmacenes(empresaId);
  }

  @Patch(':id')
  async actualizar(
    @Param('id') id: string,
    @Body() dto: Partial<CrearAlmacenDto>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.almacenesService.actualizarAlmacen(id, dto, empresaId);
  }

  @Patch(':id/estado')
  async toggleActivo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.almacenesService.toggleActivo(id, empresaId);
  }
}