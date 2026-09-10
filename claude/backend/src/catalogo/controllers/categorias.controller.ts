// src/catalogo/controllers/categorias.controller.ts
import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';
import { ActualizarCategoriaDto } from '../dto/actualizar-categoria.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { CategoriasService } from '../services/categorias.service';
import { AutoConfigurarCategoriasDto } from '../dto/catalogo-operaciones.dto';

@Controller('catalogo/categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  crear(
    @Body() dto: CrearCategoriaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.categoriasService.crearCategoria(dto, empresaId);
  }

  /**
   * POST /catalogo/categorias/auto-configurar
   * Asigna automáticamente las cuentas contables a las categorías,
   * resolviéndolas por número de cuenta (401→Ventas, 501→Costo, etc.).
   * Body opcional: { soloVacias?: boolean }  (default true).
   *
   * IMPORTANTE: va declarado ANTES de las rutas con :id para que "auto-configurar"
   * no se confunda con un parámetro id.
   */
  @Post('auto-configurar')
  autoConfigurar(
    @ActiveUser('empresaId') empresaId: string,
    @Body() dto: AutoConfigurarCategoriasDto,
  ) {
    return this.categoriasService.autoConfigurarCuentas(
      empresaId,
      dto.soloVacias ?? true,
    );
  }

  @Get()
  obtenerTodas(@ActiveUser('empresaId') empresaId: string) {
    return this.categoriasService.obtenerCategorias(empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarCategoriaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.categoriasService.actualizarCategoria(id, dto, empresaId);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.categoriasService.cambiarEstadoCategoria(id, empresaId);
  }
}
