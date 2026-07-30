import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import {
  CerrarPeriodoGuiadoDto,
  IniciarRevisionCierreDto,
  PrepararCierreDto,
  ReabrirPeriodoDto,
} from '../dto/cierre-mensual.dto';
import { CierreContableService } from '../services/cierre-contable.service';

@Controller('finanzas/cierres')
export class CierreContableController {
  constructor(private readonly service: CierreContableService) {}

  @Navegable('/dashboard/finanzas/cierre-contable', 'Cierre Contable', 57)
  @Get()
  obtenerEstadoPeriodos(@ActiveUser('empresaId') empresaId: string) {
    return this.service.obtenerEstadoPeriodos(empresaId);
  }

  @Get('resumen/:anio/:mes')
  resumenPeriodo(
    @Param('anio', ParseIntPipe) anio: number,
    @Param('mes', ParseIntPipe) mes: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.resumenPeriodo(empresaId, mes, anio);
  }

  @Get('guiado/:anio/:mes')
  revisionActual(
    @Param('anio', ParseIntPipe) anio: number,
    @Param('mes', ParseIntPipe) mes: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.obtenerRevisionActual(empresaId, anio, mes);
  }

  @Post('guiado/iniciar')
  iniciarRevision(
    @Body() dto: IniciarRevisionCierreDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.iniciarRevision(empresaId, usuarioId, dto);
  }

  @Put('guiado/:id/confirmar')
  prepararRevision(
    @Param('id') id: string,
    @Body() dto: PrepararCierreDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.prepararRevision(empresaId, usuarioId, id, dto);
  }

  @Get('historial/:anio/:mes')
  historial(
    @Param('anio', ParseIntPipe) anio: number,
    @Param('mes', ParseIntPipe) mes: number,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.obtenerHistorial(empresaId, anio, mes);
  }

  @Post('cerrar')
  cerrarPeriodo(
    @Body() dto: CerrarPeriodoGuiadoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.cerrarPeriodo({ ...dto, empresaId, usuarioId });
  }

  @Post('reabrir')
  reabrirPeriodo(
    @Body() dto: ReabrirPeriodoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.service.reabrirPeriodo({ ...dto, empresaId, usuarioId });
  }
}
