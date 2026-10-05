import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { InventarioService } from '../services/inventario.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { AjusteInventarioDto, RegistrarCompraInventarioDto, RegistrarSalidaInventarioDto, TransferirInventarioDto } from '../dto/inventario-operaciones.dto';

@Controller('catalogo/inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  /**
   * ──────────────────────────────────────────────────────────────────────────
   * Los dos botones del renglón del catálogo
   * --------------------------------------------------------------------------
   * Son los dos iconos verde y ámbar de cada producto en /dashboard/productos.
   * Entraban directo a `registrarCompra` / `registrarSalida`, que a propósito no
   * encolan asiento: lo encola quien tiene el documento —la orden de compra, la
   * venta, la transferencia—. Pero aquí no hay documento, así que no había
   * nadie, y el valor del inventario subía y bajaba sin tocar el mayor. Tampoco
   * se guardaba quién: el kardex mostraba el movimiento con la columna vacía.
   *
   * Ahora pasan por `movimientoDesdeElCatalogo`, el único sitio que decide qué
   * asiento lleva un movimiento sin documento. El mismo por el que pasa el
   * ajuste manual.
   * ──────────────────────────────────────────────────────────────────────────
   */
  @Post('productos/:id/compra')
  async registrarCompra(
    @Param('id') id: string,
    @Body() dto: RegistrarCompraInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.inventarioService.movimientoDesdeElCatalogo({
      direccion: 'ENTRADA',
      productoId: id,
      almacenId: dto.almacenId,
      cantidad: dto.cantidad,
      motivo: `Entrada sin documento: ${dto.motivo}`,
      empresaId,
      usuarioId,
      numeroLote: dto.numeroLote,
      fechaCaducidad: dto.fechaCaducidad,
      equivalenciaId: dto.equivalenciaId,
    });
  }

  @Post('productos/:id/salida')
  async registrarSalida(
    @Param('id') id: string,
    @Body() dto: RegistrarSalidaInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.inventarioService.movimientoDesdeElCatalogo({
      direccion: 'SALIDA',
      productoId: id,
      almacenId: dto.almacenId,
      cantidad: dto.cantidad,
      motivo: dto.motivo,
      empresaId,
      usuarioId,
      equivalenciaId: dto.equivalenciaId,
      loteEspecificoId: dto.loteEspecificoId,
      ubicacionId: dto.ubicacionId,
    });
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

  /**
   * ──────────────────────────────────────────────────────────────────────────
   * El ajuste también deja nombre
   * --------------------------------------------------------------------------
   * La transferencia de arriba captura `usuarioId` desde que se cerró el
   * circuito de cuatro ojos del almacén. Éste no lo pedía, aunque
   * `MovimientoInventario` tiene el campo.
   *
   * Y es la operación que más lo necesita: un ajuste INVENTA existencias y,
   * desde que se cerró el hueco contable, también inventa asientos. Era la
   * única operación del sistema que cambiaba el valor del inventario sin dejar
   * quién. En el kardex aparecía «Ajuste manual» y ahí se acababa la
   * investigación.
   * ──────────────────────────────────────────────────────────────────────────
   */
  @Post('productos/ajuste')
  async ajusteManual(
    @Body() dto: AjusteInventarioDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.inventarioService.ajusteManual(
      dto.productoId, dto.almacenId, dto.cantidad, dto.tipo, dto.motivo,
      empresaId, dto.loteEspecificoId, undefined, dto.costoUnitario, usuarioId,
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
