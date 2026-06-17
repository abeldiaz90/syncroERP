import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { MarcaService } from '../services/marca.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { CreateMarcaDto } from '../dto/create-marca.dto';

@Controller('catalogo/marcas')
export class MarcaController {
  constructor(private readonly marcaService: MarcaService) {}

  @Get()
  findAll(@ActiveUser('empresaId') empresaId: string) {
    return this.marcaService.findAll(empresaId);
  }

  @Post()
  create(@Body() createDto: CreateMarcaDto, @ActiveUser('empresaId') empresaId: string) {
    return this.marcaService.create(createDto.nombre, empresaId);
  }

  // RUTA ESPECÍFICA PRIMERO
  @Patch(':id/estado')
  toggleStatus(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.marcaService.toggleStatus(id, empresaId);
  }

  // RUTA GENÉRICA DESPUÉS
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: CreateMarcaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.marcaService.update(id, updateDto.nombre, empresaId);
  }
}