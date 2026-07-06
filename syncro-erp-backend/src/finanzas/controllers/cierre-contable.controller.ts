import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { CierreContableService } from '../services/cierre-contable.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';

@Controller('finanzas/cierres')
export class CierreContableController {
  constructor(private readonly svc: CierreContableService) {}

  @Navegable('/dashboard/finanzas/cierre-contable', 'Cierre Contable', 57)
  @Get()
  obtenerEstadoPeriodos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerEstadoPeriodos(empresaId);
  }

  @Get('resumen/:anio/:mes')
  resumenPeriodo(
    @Param('anio') anio: string,
    @Param('mes')  mes:  string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.resumenPeriodo(empresaId, Number(mes), Number(anio));
  }

  @Post('cerrar')
  cerrarPeriodo(
    @Body() body: { mes: number; anio: number; notas?: string },
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id')        usuarioId: string,
  ) {
    return this.svc.cerrarPeriodo({ ...body, empresaId, usuarioId });
  }

  @Post('reabrir')
  reabrirPeriodo(
    @Body() body: { mes: number; anio: number; justificacion: string },
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id')        usuarioId: string,
  ) {
    return this.svc.reabrirPeriodo({ ...body, empresaId, usuarioId });
  }
}