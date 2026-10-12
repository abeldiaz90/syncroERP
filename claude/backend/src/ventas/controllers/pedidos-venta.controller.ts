import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import {
  CancelarPedidoVentaDto,
  CrearPedidoVentaDto,
  SurtirPedidoDto,
} from '../dto/pedido-venta.dto';
import { PedidosVentaService } from '../services/pedidos-venta.service';

@ApiTags('Ventas')
@ApiBearerAuth('jwt')
@Controller('ventas/pedidos')
export class PedidosVentaController {
  constructor(private readonly svc: PedidosVentaService) {}

  @Navegable('/dashboard/ventas/pedidos', 'Pedidos de venta', 4)
  @Get()
  @ApiOperation({ summary: 'Los pedidos de venta' })
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.svc.listar(empresaId, { estado, clienteId });
  }

  @Get('en-espera')
  @ApiOperation({
    summary: 'Lo comprometido que no tiene mercancía: el reporte de backorder',
  })
  enEspera(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.enEspera(empresaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un pedido con lo surtido, lo apartado y lo que espera' })
  obtener(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtener(id, empresaId);
  }

  @Post()
  @ApiOperation({ summary: 'Captura el pedido. No aparta nada todavía' })
  crear(
    @Body() dto: CrearPedidoVentaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rolUsuario?: string,
  ) {
    return this.svc.crear(empresaId, usuarioId, { ...dto, rolUsuario });
  }

  @Patch(':id/confirmar')
  @ApiOperation({
    summary: 'Compromete el pedido: aparta lo que hay y anota lo que falta',
  })
  confirmar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.confirmar(id, empresaId, usuarioId);
  }

  @Patch(':id/reintentar-apartado')
  @ApiOperation({
    summary: 'Vuelve a apartar lo que quedó en espera, si ya entró mercancía',
  })
  reintentar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.reintentarApartado(id, empresaId, usuarioId);
  }

  @Post(':id/surtir')
  @ApiOperation({
    summary: 'Entrega: genera la venta de siempre consumiendo lo apartado',
  })
  surtir(
    @Param('id') id: string,
    @Body() dto: SurtirPedidoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rolUsuario?: string,
  ) {
    return this.svc.surtir(id, empresaId, dto, usuarioId, rolUsuario);
  }

  @Patch(':id/cancelar')
  @ApiOperation({ summary: 'Cancela y suelta lo apartado' })
  cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarPedidoVentaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.cancelar(id, empresaId, dto.motivo);
  }
}
