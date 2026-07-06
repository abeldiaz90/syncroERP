import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { CobranzaService } from '../services/cobranza.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';

@SkipPermisos()
@Controller('credito/cobranza')
export class CobranzaController {
  constructor(private readonly svc: CobranzaService) {}

  /** Registrar un pago de cobranza */
  @Post('pago')
  registrarPago(
    @Body() body: any,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.svc.registrarPago({ ...body, empresaId, usuarioId });
  }

  /** Historial de pagos de un crédito */
  @Get('pagos/:creditoId')
  pagosCredito(
    @Param('creditoId') creditoId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPagosPorCredito(creditoId, empresaId);
  }

  /** Actualizar cuotas vencidas manualmente */
  @Post('actualizar-vencidos')
  actualizarVencidos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.actualizarVencidos(empresaId); // ← corregido
  }
}