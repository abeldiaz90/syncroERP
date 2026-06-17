import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { InventarioService } from '../services/inventario.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('catalogo/inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Post('productos/:id/compra')
  async registrarCompra(
    @Param('id') id: string,
    @Body('almacenId') almacenId: string,
    @Body('cantidad') cantidad: number,
    @Body('motivo') motivo: string,
    // ⚠️ parámetro requerido colocado antes de los opcionales
    @ActiveUser('empresaId') empresaId: string,
    @Body('numeroLote') numeroLote?: string,
    @Body('fechaCaducidad') fechaCaducidad?: string,
    @Body('equivalenciaId') equivalenciaId?: string,
  ) {
    return this.inventarioService.registrarCompra(
      id,
      almacenId,
      Number(cantidad),
      motivo,
      empresaId,
      numeroLote,
      fechaCaducidad,
      equivalenciaId,
    );
  }

  @Post('productos/:id/salida')
  async registrarSalida(
    @Param('id') id: string,
    @Body('almacenId') almacenId: string,
    @Body('cantidad') cantidad: number,
    @Body('motivo') motivo: string,
    @ActiveUser('empresaId') empresaId: string,
    @Body('equivalenciaId') equivalenciaId?: string,
    @Body('loteEspecificoId') loteEspecificoId?: string,
  ) {
    return this.inventarioService.registrarSalida(
      id,
      almacenId,
      Number(cantidad),
      motivo,
      empresaId,
      equivalenciaId,
      loteEspecificoId,
    );
  }

  @Get('productos/:id/movimientos')
  async obtenerKardex(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.inventarioService.obtenerMovimientosPorProducto(id, empresaId);
  }

  @Post('productos/transferir')
  async transferir(
    @Body('productoId') productoId: string,
    @Body('almacenOrigenId') origenId: string,
    @Body('almacenDestinoId') destinoId: string,
    @Body('cantidad') cantidad: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.inventarioService.transferirStock(
      productoId,
      origenId,
      destinoId,
      cantidad,
      empresaId,
    );
  }

  @Post('productos/ajuste')
  async ajusteManual(
    @Body('productoId') productoId: string,
    @Body('almacenId') almacenId: string,
    @Body('cantidad') cantidad: number,
    @Body('tipo') tipo: 'INGRESO' | 'MERMA',
    @Body('motivo') motivo: string,
    @ActiveUser('empresaId') empresaId: string,
    @Body('loteEspecificoId') loteEspecificoId?: string,
  ) {
    return this.inventarioService.ajusteManual(
      productoId,
      almacenId,
      Number(cantidad),
      tipo,
      motivo,
      empresaId,
      loteEspecificoId,
    );
  }

  @Get('stock')
  async obtenerStock(
    @Query('productoId') productoId: string,
    @Query('almacenId') almacenId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    const cantidad = await this.inventarioService.obtenerStockEnAlmacen(productoId, almacenId, empresaId);
    return { cantidad };
  }

  @Get('productos/:id/lotes')
  async obtenerLotes(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.inventarioService.obtenerLotesPorProducto(id, empresaId, almacenId);
  }
}