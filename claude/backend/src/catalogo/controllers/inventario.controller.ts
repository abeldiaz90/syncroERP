import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { InventarioService } from '../services/inventario.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { AjusteInventarioDto, RegistrarCompraInventarioDto, RegistrarSalidaInventarioDto, TransferirInventarioDto } from '../dto/inventario-operaciones.dto';

@Controller('catalogo/inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Post('productos/:id/compra')
  async registrarCompra(
    @Param('id') id: string,
    @Body() dto: RegistrarCompraInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.inventarioService.registrarCompra(
      id, dto.almacenId, dto.cantidad, dto.motivo, empresaId,
      dto.numeroLote, dto.fechaCaducidad, dto.equivalenciaId,
    );
  }

  @Post('productos/:id/salida')
  async registrarSalida(
    @Param('id') id: string,
    @Body() dto: RegistrarSalidaInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.inventarioService.registrarSalida(
      id, dto.almacenId, dto.cantidad, dto.motivo, empresaId,
      dto.equivalenciaId, dto.loteEspecificoId, undefined, undefined,
      dto.ubicacionId,
    );
  }

  @Get('productos/:id/movimientos')
  async obtenerKardex(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('pagina') pagina = '1',
    @Query('limite') limite = '50',
    @Query('almacenId') almacenId?: string,
  ) {
    return this.inventarioService.obtenerMovimientosPorProducto(id, empresaId, Number(pagina), Number(limite), almacenId);
  }

  @Post('productos/transferir')
  async transferir(
    @Body() dto: TransferirInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.inventarioService.transferirStock(
      dto.productoId, dto.almacenOrigenId, dto.almacenDestinoId, dto.cantidad,
      empresaId, undefined, dto.motivo || 'Transferencia entre almacenes', usuarioId,
    );
  }

  @Post('productos/ajuste')
  async ajusteManual(
    @Body() dto: AjusteInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.inventarioService.ajusteManual(
      dto.productoId, dto.almacenId, dto.cantidad, dto.tipo, dto.motivo,
      empresaId, dto.loteEspecificoId, undefined, dto.costoUnitario,
    );
  }

  @Get('stock')
  async obtenerStock(
    @Query('productoId') productoId: string,
    @Query('almacenId') almacenId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    const cantidad = await this.inventarioService.obtenerStockEnAlmacen(
      productoId,
      almacenId,
      empresaId,
    );
    return { cantidad };
  }

  @Get('productos/:id/lotes')
  async obtenerLotes(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.inventarioService.obtenerLotesPorProducto(
      id,
      empresaId,
      almacenId,
    );
  }

  @Get('valorizado')
  async valorizado(
    @ActiveUser('empresaId') empresaId: string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.inventarioService.valuacion(empresaId, almacenId);
  }

  @Get('transferencias')
  async listarTransferencias(
    @ActiveUser('empresaId') empresaId: string,
    @Query('pagina') pagina = '1',
    @Query('limite') limite = '20',
  ) {
    return this.inventarioService.listarTransferencias(empresaId, Number(pagina), Number(limite));
  }
}
