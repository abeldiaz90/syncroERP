import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CobranzaService } from '../services/cobranza.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { RegistrarPagoCobranzaDto } from '../dto/registrar-pago-cobranza.dto';

@Controller('credito/cobranza')
export class CobranzaController {
  constructor(private readonly svc: CobranzaService) {}

  @Post('pago')
  registrarPago(
    @Body() dto: RegistrarPagoCobranzaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.registrarPago(dto, empresaId, usuarioId);
  }

  @Get('pagos/:creditoId')
  pagosCredito(
    @Param('creditoId') creditoId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPagosPorCredito(creditoId, empresaId);
  }

  @Get('pagos-del-dia')
  pagosDelDia(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.svc.obtenerPagosDelDia(empresaId, fecha);
  }

  @Post('actualizar-vencidos')
  actualizarVencidos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.actualizarVencidos(empresaId);
  }
}
