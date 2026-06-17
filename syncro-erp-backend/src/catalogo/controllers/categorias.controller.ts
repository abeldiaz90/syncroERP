// src/catalogo/controllers/categorias.controller.ts
import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { CategoriasService } from '../services/categorias.service';

@Controller('catalogo/categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  crear(
    @Body() dto: CrearCategoriaDto, 
    @ActiveUser('empresaId') empresaId: string
  ) {
    return this.categoriasService.crearCategoria(dto, empresaId);
  }

  @Get()
  obtenerTodas(@ActiveUser('empresaId') empresaId: string) {
    return this.categoriasService.obtenerCategorias(empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string, 
    @Body() dto: Partial<CrearCategoriaDto>, 
    @ActiveUser('empresaId') empresaId: string
  ) {
    return this.categoriasService.actualizarCategoria(id, dto, empresaId);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id') id: string, 
    @ActiveUser('empresaId') empresaId: string
  ) {
    return this.categoriasService.cambiarEstadoCategoria(id, empresaId);
  }
}