import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { UsuariosService } from '../services/usuarios.service';
import { CrearUsuarioDto } from '../dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
import { ActiveUser } from '../decorators/active-user.decorator';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @ActiveUser('empresaId') empresaId: string) {
    return this.usuariosService.crear(dto, empresaId);
  }

  @Get()
  obtenerTodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('filtro') filtro?: string,
    @Query('activos') activos?: string,
  ) {
    const soloActivos = activos !== 'false';
    return this.usuariosService.obtenerTodos(empresaId, filtro, soloActivos);
  }

  @Get(':id')
  obtenerPorId(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.usuariosService.obtenerPorId(id, empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.usuariosService.actualizar(id, dto, empresaId);
  }

  @Patch(':id/estado')
  toggleActivo(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.usuariosService.toggleActivo(id, empresaId);
  }
}