import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ListasPrecioService } from '../services/listas-precio.service';
import { PreciosService } from '../services/precios.service';

@Controller('catalogo/listas-precio')
export class ListasPrecioController {
  constructor(
    private readonly listasPrecioService: ListasPrecioService,
    private readonly preciosService: PreciosService,
  ) {}

  @Get('producto/:productoId')
  consultarPrecio(
    @Param('productoId') productoId: string,
    @Query('listaPrecioId') listaPrecioId: string | undefined,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.preciosService.consultarPrecio(
      productoId,
      empresaId,
      listaPrecioId,
    );
  }

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
  eliminarLista(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.listasPrecioService.eliminarLista(id, empresaId);
  }
}
