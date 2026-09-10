/**
 * ============================================================================
 * SyncroERP · Tesorería — controlador
 * ============================================================================
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TesoreriaService } from '../services/tesoreria.service';
import {
  CancelarMovimientoTesoreriaDto,
  ConciliacionAutomaticaDto,
  ConciliacionManualDto,
  CrearEstadoCuentaDto,
  CrearMovimientoTesoreriaDto,
  TraspasoTesoreriaDto,
} from '../dto/tesoreria.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import {
  EstadoConciliacion,
  TipoMovimiento,
} from '../entities/tesoreria.entity';

@ApiTags('Tesorería')
@ApiBearerAuth('jwt')
@Controller('tesoreria')
export class TesoreriaController {
  constructor(private readonly svc: TesoreriaService) {}

  /* ── Saldos ────────────────────────────────────────────────────────────── */

  @Get('saldos')
  @ApiOperation({
    summary: 'Saldo actual de cada cuenta y movimientos por conciliar',
  })
  saldos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.saldosPorCuenta(empresaId);
  }

  /* ── Movimientos ───────────────────────────────────────────────────────── */

  @Get('movimientos')
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('cuentaBancariaId') cuentaBancariaId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('tipo') tipo?: TipoMovimiento,
    @Query('conciliacion') conciliacion?: EstadoConciliacion,
    @Query('busqueda') busqueda?: string,
  ) {
    return this.svc.listarMovimientos(empresaId, {
      cuentaBancariaId,
      desde,
      hasta,
      tipo,
      conciliacion,
      busqueda,
    });
  }

  @Post('movimientos')
  registrar(
    @Body() dto: CrearMovimientoTesoreriaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.registrar(dto, empresaId, usuarioId);
  }

  @Patch('movimientos/:id/cancelar')
  @ApiOperation({
    summary: 'Cancela el movimiento',
    description:
      'Genera una contrapartida en lugar de borrar, para conservar la auditoría.',
  })
  cancelar(
    @Param('id') id: string,
    @Body() body: CancelarMovimientoTesoreriaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.cancelar(id, body.motivo, empresaId, usuarioId);
  }

  @Post('traspasos')
  @ApiOperation({ summary: 'Traspaso entre cuentas propias' })
  traspasar(
    @Body() dto: TraspasoTesoreriaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.traspasar(dto, empresaId, usuarioId);
  }

  /* ── Conciliación ──────────────────────────────────────────────────────── */

  @Post('conciliacion/estados-cuenta')
  @ApiOperation({
    summary: 'Carga el estado de cuenta del banco y valida que cuadre',
  })
  cargarEstado(
    @Body() dto: CrearEstadoCuentaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearEstadoCuenta(dto, empresaId);
  }

  @Post('conciliacion/:estadoCuentaId/automatica')
  @ApiOperation({
    summary: 'Empareja por importe y ventana de fechas',
    description:
      'Las líneas con más de un candidato quedan pendientes y se reportan.',
  })
  automatica(
    @Param('estadoCuentaId') estadoCuentaId: string,
    @Body() body: ConciliacionAutomaticaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.conciliarAutomatico(
      estadoCuentaId,
      empresaId,
      body?.ventanaDias ?? 5,
    );
  }

  @Post('conciliacion/manual')
  manual(
    @Body() body: ConciliacionManualDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.conciliarManual(body.lineaId, body.movimientoId, empresaId);
  }

  @Get('conciliacion/:estadoCuentaId/reporte')
  @ApiOperation({
    summary:
      'Conciliación bancaria: explica la diferencia entre banco y libros',
  })
  reporte(
    @Param('estadoCuentaId') estadoCuentaId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.reporteConciliacion(estadoCuentaId, empresaId);
  }

  /* ── Flujo de efectivo ─────────────────────────────────────────────────── */

  @Get('flujo-efectivo')
  @ApiOperation({ summary: 'Entradas y salidas por día y por origen' })
  flujo(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('cuentaBancariaId') cuentaBancariaId?: string,
  ) {
    return this.svc.flujoEfectivo(empresaId, desde, hasta, cuentaBancariaId);
  }
}
