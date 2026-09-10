import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ParseSqlServerGuidPipe } from '../../common/pipes/parse-sql-server-guid.pipe';
import {
  AbrirTurnoCajaDto,
  CerrarTurnoCajaDto,
  MovimientoManualCajaDto,
} from '../dto/caja.dto';
import { NaturalezaMovimientoCaja } from '../entities/movimiento-caja.entity';
import { CajaService } from '../services/caja.service';

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Post('turnos/abrir')
  abrir(
    @Body() dto: AbrirTurnoCajaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.caja.abrir(dto, empresaId, usuarioId);
  }

  @Get('turnos/abiertos')
  abiertos(@ActiveUser('empresaId') empresaId: string) {
    return this.caja.turnosAbiertos(empresaId);
  }

  @Get('turnos')
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
    @Query('limite', new DefaultValuePipe(20), ParseIntPipe) limite: number,
  ) {
    return this.caja.listarTurnos(empresaId, pagina, limite);
  }

  @Get('turnos/:id/resumen')
  resumen(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.caja.resumen(id, empresaId);
  }

  @Get('turnos/:id/movimientos')
  movimientos(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.caja.movimientosTurno(id, empresaId);
  }

  @Post('turnos/:id/cerrar')
  cerrar(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: CerrarTurnoCajaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.caja.cerrar(id, dto, empresaId, usuarioId);
  }

  @Post('movimientos/entrada')
  entrada(
    @Body() dto: MovimientoManualCajaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.caja.registrarManual(
      dto,
      NaturalezaMovimientoCaja.ENTRADA,
      empresaId,
      usuarioId,
    );
  }

  @Post('movimientos/retiro')
  retiro(
    @Body() dto: MovimientoManualCajaDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.caja.registrarManual(
      dto,
      NaturalezaMovimientoCaja.SALIDA,
      empresaId,
      usuarioId,
    );
  }
}
