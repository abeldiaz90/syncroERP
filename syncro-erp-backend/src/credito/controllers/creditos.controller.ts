import { Controller, Post, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { CreditosService, SimularCreditoDto } from '../services/creditos.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { TipoCredito, EstadoCredito } from '../entities/credito-cliente.entity';

@SkipPermisos()
@Controller('credito/creditos')
export class CreditosController {
  constructor(private readonly svc: CreditosService) {}

  /** Simular tabla de amortización sin crear el crédito */
  @Post('simular')
  simular(@Body() dto: SimularCreditoDto) {
    return this.svc.calcularAmortizacion(dto);
  }

  /** Crear crédito desde una venta o de forma independiente */
  @Post()
  crear(
    @Body() body: any,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearCredito({ ...body, empresaId });
  }

  @Get()
  obtenerTodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoCredito,
  ) {
    return this.svc.obtenerTodos(empresaId, estado);
  }

  @Get('cartera-vencida')
  carteraVencida(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerCarteraVencida(empresaId);
  }

  @Get('cliente/:clienteId')
  porCliente(
    @Param('clienteId') clienteId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPorCliente(clienteId, empresaId);
  }

  @Get(':id')
  obtenerUno(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPorId(id, empresaId);
  }
}