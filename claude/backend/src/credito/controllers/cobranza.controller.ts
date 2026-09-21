import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CobranzaService } from '../services/cobranza.service';
import { CarteraReflejoService } from '../services/cartera-reflejo.service';
import { Roles } from '../../iam/decorators/roles.decorator';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { RegistrarPagoCobranzaDto } from '../dto/registrar-pago-cobranza.dto';

@Controller('credito/cobranza')
export class CobranzaController {
  constructor(
    private readonly svc: CobranzaService,
    private readonly reflejo: CarteraReflejoService,
  ) {}

  /**
   * Refleja ahora las transacciones nacidas en el registro externo.
   *
   * Existe para poder comprobarlo sin esperar al cron. No hace nada distinto
   * de lo que hace el cron, y es idempotente: repetirlo no cobra dos veces.
   */
  @Post('reflejar-externas')
  @Roles('administrador', 'direccion')
  reflejarExternas(@ActiveUser('empresaId') empresaId: string) {
    return this.reflejo.reflejarEmpresa(empresaId);
  }

  @Post('pago')
  registrarPago(
    @Body() dto: RegistrarPagoCobranzaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.registrarPago(dto, empresaId, usuarioId);
  }

  /** Deshace una cobranza. El pago no se borra: se marca y se revierte. */
  @Post('pago/:pagoId/cancelar')
  @Roles('administrador', 'direccion', 'gerencia')
  cancelarPago(
    @Param('pagoId') pagoId: string,
    @Body() dto: { motivo: string },
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.cancelarPago(pagoId, empresaId, dto, usuarioId);
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
