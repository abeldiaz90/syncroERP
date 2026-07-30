import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { VentasService } from '../services/ventas.service';
import { CrearVentaDto } from '../dto/crear-venta.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { EstadoVenta } from '../entities/venta.entity';
import { AnulacionVentasService } from '../services/anulacion-ventas.service';
import { DevolucionesVentasService } from '../services/devoluciones-ventas.service';
import { CrearDevolucionVentaDto } from '../dto/crear-devolucion-venta.dto';

@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly anulacionService: AnulacionVentasService,
    private readonly devolucionesService: DevolucionesVentasService,
  ) {}

  // ── RUTAS FIJAS antes de :id ───────────────────────────────────

  @Get('dashboard/metricas')
  obtenerMetricas(@ActiveUser('empresaId') empresaId: string) {
    return this.ventasService.obtenerMetricasVentas(empresaId);
  }

  @Get('dashboard/top-productos')
  topProductos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('dias') dias?: string,
  ) {
    return this.ventasService.obtenerTopProductos(
      empresaId,
      Number(dias) || 30,
    );
  }

  @Get('devoluciones')
  listarDevoluciones(
    @ActiveUser('empresaId') empresaId: string,
    @Query('ventaId') ventaId?: string,
  ) {
    return this.devolucionesService.listar(empresaId, ventaId);
  }

  @Get('devoluciones/:devolucionId')
  obtenerDevolucion(
    @Param('devolucionId') devolucionId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.devolucionesService.obtenerPorId(devolucionId, empresaId);
  }

  @Get('clientes/:clienteId/saldo-favor')
  saldoFavorCliente(
    @Param('clienteId') clienteId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.devolucionesService.saldoFavorCliente(clienteId, empresaId);
  }

  // ── CRUD ───────────────────────────────────────────────────────

  @Post()
  crear(
    @Body() dto: CrearVentaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rolUsuario: string,
  ) {
    return this.ventasService.crear(dto, empresaId, usuarioId, rolUsuario);
  }

  @Get()
  obtenerTodas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
    @Query('limite', new DefaultValuePipe(20), ParseIntPipe) limite: number,
    @Query('estado') estado?: EstadoVenta,
    @Query('clienteId') clienteId?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.ventasService.obtenerTodas(
      empresaId,
      pagina,
      limite,
      estado,
      clienteId,
      fechaDesde,
      fechaHasta,
    );
  }

  @Get(':id/devoluciones/disponible')
  disponibleParaDevolver(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.devolucionesService.disponible(id, empresaId);
  }

  @Post(':id/devoluciones')
  crearDevolucion(
    @Param('id') id: string,
    @Body() dto: CrearDevolucionVentaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.devolucionesService.crear(id, dto, empresaId, usuarioId);
  }

  @Get(':id')
  obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.ventasService.obtenerPorId(id, empresaId);
  }

  @Patch(':id/anular')
  anular(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @Body('motivo') motivo: string,
  ) {
    return this.anulacionService.anular(id, empresaId, motivo, usuarioId);
  }
}
