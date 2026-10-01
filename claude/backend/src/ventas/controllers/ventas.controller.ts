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
  Headers,
} from '@nestjs/common';
import { VentasService } from '../services/ventas.service';
import { CrearVentaDto } from '../dto/crear-venta.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { EstadoVenta } from '../entities/venta.entity';
import { AnulacionVentasService } from '../services/anulacion-ventas.service';
import { DevolucionesVentasService } from '../services/devoluciones-ventas.service';
import { CrearDevolucionVentaDto } from '../dto/crear-devolucion-venta.dto';
import { AnularVentaDto } from '../dto/anular-venta.dto';
import { topeDescuentoDeRol } from '../../catalogo/constants/tope-descuento';

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

  /**
   * Cuánto puede descontar en el mostrador quien está preguntando.
   *
   * La caja lo consulta al abrir. Si es 0, no dibuja el campo de descuento:
   * un campo que el servidor va a rechazar no es una opción, es una trampa.
   *
   * Vive bajo `/ventas` a propósito —el prefijo que ya tiene el rol `empleado`,
   * que es con el que se vende— para que la caja no dependa de un permiso
   * aparte que alguien podría retirar sin saber que apaga el mostrador.
   */
  @Get('tope-descuento')
  topeDescuento(@ActiveUser('rol') rolUsuario?: string) {
    const topePorcentaje = topeDescuentoDeRol(rolUsuario);
    return { topePorcentaje, puedeDescontar: topePorcentaje > 0 };
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
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.ventasService.crear(dto, empresaId, usuarioId, rolUsuario, idempotencyKey);
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
    @ActiveUser('rol') rolUsuario: string,
  ) {
    return this.devolucionesService.crear(
      id,
      dto,
      empresaId,
      usuarioId,
      rolUsuario,
    );
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
    @Body() dto: AnularVentaDto,
    @ActiveUser('rol') rolUsuario?: string,
  ) {
    return this.anulacionService.anular(
      id,
      empresaId,
      dto.motivo,
      usuarioId,
      rolUsuario,
    );
  }
}
