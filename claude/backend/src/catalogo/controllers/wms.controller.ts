import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { WmsService } from '../services/wms.service';
import { EstadoTransferenciaInventario } from '../entities/transferencia-inventario.entity';
import {
  ActualizarProductoUbicacionWmsDto,
  ActualizarUbicacionWmsDto,
  AsignarProductoUbicacionWmsDto,
  CapturarConteoWmsDto,
  CrearConteoWmsDto,
  CrearReservaWmsDto,
  CrearTransferenciaWmsDto,
  CrearUbicacionWmsDto,
  FiltroStockUbicacionWmsDto,
  RecibirTransferenciaWmsDto,
  ReubicarStockWmsDto,
} from '../dto/wms.dto';

@Controller('catalogo/wms')
export class WmsController {
  constructor(private readonly wms: WmsService) {}

  @Get('disponibilidad')
  disponibilidad(@ActiveUser('empresaId') e: string, @Query('productoId') p: string, @Query('almacenId') a: string) { return this.wms.disponibilidad(e, p, a); }

  @Post('reservas')
  reservar(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Body() b: CrearReservaWmsDto) { return this.wms.reservar(e, u, b); }
  @Patch('reservas/:id/liberar') liberar(@ActiveUser('empresaId') e: string, @Param('id') id: string) { return this.wms.liberarReserva(e, id, false); }
  @Patch('reservas/:id/consumir') consumir(@ActiveUser('empresaId') e: string, @Param('id') id: string) { return this.wms.liberarReserva(e, id, true); }

  @Post('transferencias')
  crearTransferencia(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Body() b: CrearTransferenciaWmsDto) { return this.wms.crearTransferencia(e, u, b); }
  @Get('transferencias') listarTransferencias(@ActiveUser('empresaId') e: string, @Query('pagina') p = '1', @Query('limite') l = '20', @Query('estado') estado?: EstadoTransferenciaInventario) { return this.wms.listarTransferencias(e, +p, +l, estado); }
  @Patch('transferencias/:id/autorizar') autorizar(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Param('id') id: string) { return this.wms.cambiarEstadoTransferencia(e, id, 'autorizar', u); }
  @Patch('transferencias/:id/enviar') enviar(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Param('id') id: string) { return this.wms.cambiarEstadoTransferencia(e, id, 'enviar', u); }
  @Patch('transferencias/:id/recibir') recibir(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Param('id') id: string, @Body() b: RecibirTransferenciaWmsDto) { return this.wms.cambiarEstadoTransferencia(e, id, 'recibir', u, b); }
  @Patch('transferencias/:id/cancelar') cancelar(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Param('id') id: string) { return this.wms.cambiarEstadoTransferencia(e, id, 'cancelar', u); }

  @Post('ubicaciones') crearUbicacion(@ActiveUser('empresaId') e: string, @Body() b: CrearUbicacionWmsDto) { return this.wms.crearUbicacion(e, b); }
  @Get('ubicaciones') listarUbicaciones(@ActiveUser('empresaId') e: string, @Query('almacenId') a?: string) { return this.wms.listarUbicaciones(e, a); }
  @Patch('ubicaciones/:id') actualizarUbicacion(@ActiveUser('empresaId') e: string, @Param('id') id: string, @Body() b: ActualizarUbicacionWmsDto) { return this.wms.actualizarUbicacion(e, id, b); }

  @Get('productos/:productoId/ubicaciones') listarUbicacionesProducto(@ActiveUser('empresaId') e: string, @Param('productoId') p: string) { return this.wms.listarUbicacionesProducto(e, p); }
  @Post('productos/:productoId/ubicaciones') asignarUbicacionProducto(@ActiveUser('empresaId') e: string, @Param('productoId') p: string, @Body() b: AsignarProductoUbicacionWmsDto) { return this.wms.asignarUbicacionProducto(e, p, b); }
  @Patch('productos/:productoId/ubicaciones/:id') actualizarAsignacionProducto(@ActiveUser('empresaId') e: string, @Param('id') id: string, @Body() b: ActualizarProductoUbicacionWmsDto) { return this.wms.actualizarAsignacionProducto(e, id, b); }
  @Get('stock-ubicaciones') listarStockUbicaciones(@ActiveUser('empresaId') e: string, @Query() q: FiltroStockUbicacionWmsDto) { return this.wms.listarStockUbicaciones(e, q); }
  @Post('reubicaciones') reubicar(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Body() b: ReubicarStockWmsDto) { return this.wms.reubicar(e, u, b); }
  @Get('integridad-ubicaciones') verificarConsistencia(@ActiveUser('empresaId') e: string) { return this.wms.verificarConsistenciaUbicaciones(e); }

  @Post('conteos') crearConteo(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Body() b: CrearConteoWmsDto) { return this.wms.crearConteo(e, u, b); }
  @Get('conteos') listarConteos(@ActiveUser('empresaId') e: string) { return this.wms.listarConteos(e); }
  @Get('conteos/:id') obtenerConteo(@ActiveUser('empresaId') e: string, @Param('id') id: string) { return this.wms.obtenerConteo(e, id); }
  @Patch('conteos/:id/capturar') capturarConteo(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Param('id') id: string, @Body() b: CapturarConteoWmsDto) { return this.wms.capturarConteo(e, id, u, b); }
  @Patch('conteos/:id/cerrar') cerrarConteo(@ActiveUser('empresaId') e: string, @ActiveUser('id') u: string, @Param('id') id: string) { return this.wms.cerrarConteo(e, id, u); }
}
