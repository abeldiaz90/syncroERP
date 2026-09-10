import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { CreditosService } from '../services/creditos.service';
import { PoliticaVencimientoService } from '../services/politica-vencimiento.service';
import { CrearCreditoDto, SimularCreditoDto } from '../dto/crear-credito.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { TipoCredito, EstadoCredito } from '../entities/credito-cliente.entity';

@Controller('credito/creditos')
export class CreditosController {
  constructor(
    private readonly svc: CreditosService,
    private readonly vencimientos: PoliticaVencimientoService,
  ) {}

  /** Simular tabla de amortización sin crear el crédito */
  @Post('simular')
  async simular(
    @Body() dto: SimularCreditoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    // La simulación tiene que aplicar la misma política que el crédito real.
    // Si no, el cajero enseña una tabla en pantalla y el cliente firma otra.
    const ajustar = await this.vencimientos.ajustadorDe(empresaId);
    return this.svc.calcularAmortizacion(dto, ajustar);
  }

  /** Crear crédito desde una venta o de forma independiente */
  @Post()
  crear(@Body() dto: CrearCreditoDto, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearCredito({ ...dto, empresaId });
  }

  @Get()
  obtenerTodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoCredito,
    @Query('ventaId') ventaId?: string,
  ) {
    return this.svc.obtenerTodos(empresaId, estado, ventaId);
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

  @Get('cliente/:clienteId/politica')
  politicaCliente(
    @Param('clienteId') clienteId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPoliticaCliente(clienteId, empresaId);
  }

  @Get(':id')
  obtenerUno(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPorId(id, empresaId);
  }
}
