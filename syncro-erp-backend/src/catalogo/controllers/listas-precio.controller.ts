import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ListasPrecioService } from '../services/listas-precio.service';

@Controller('catalogo/listas-precio')
export class ListasPrecioController {
  constructor(private readonly listasPrecioService: ListasPrecioService) {}

  @Get()
  obtenerListas(@ActiveUser('empresaId') empresaId: string) {
    return this.listasPrecioService.obtenerListas(empresaId);
  }

  @Post()
  crearLista(
    @Body() dto: { nombre: string; esPorDefecto: boolean },
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.listasPrecioService.crearLista(dto, empresaId);
  }

  @Patch(':id')
  actualizarLista(
    @Param('id') id: string,
    @Body() dto: { nombre?: string; esPorDefecto?: boolean },
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.listasPrecioService.actualizarLista(id, dto, empresaId);
  }

  @Delete(':id')
  eliminarLista(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.listasPrecioService.eliminarLista(id, empresaId);
  }
}