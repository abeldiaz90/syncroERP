/**
 * ============================================================================
 * SyncroERP · Recursos humanos — controlador
 * ============================================================================
 */

import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RrhhService } from '../services/rrhh.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import {
  type Empleado, type Incidencia, type Puesto,
  EstadoEmpleado, RegimenPago,
} from '../entities/rrhh.entity';

@ApiTags('RRHH')
@ApiBearerAuth('jwt')
@Controller('rrhh')
export class RrhhController {
  constructor(private readonly svc: RrhhService) {}

  /* ── Indicadores ───────────────────────────────────────────────────────── */

  @Get('resumen')
  @ApiOperation({ summary: 'Plantilla, nómina mensual estimada e incidencias recientes' })
  resumen(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.resumen(empresaId);
  }

  /* ── Empleados ─────────────────────────────────────────────────────────── */

  @Get('empleados')
  listarEmpleados(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoEmpleado,
    @Query('departamentoId') departamentoId?: string,
    @Query('busqueda') busqueda?: string,
  ) {
    return this.svc.listarEmpleados(empresaId, { estado, departamentoId, busqueda });
  }

  @Post('empleados')
  crearEmpleado(@Body() dto: Partial<Empleado>, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearEmpleado(dto, empresaId);
  }

  @Get('empleados/:id')
  @ApiOperation({ summary: 'Ficha del empleado con antigüedad y días de vacaciones por ley' })
  obtenerEmpleado(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerEmpleado(id, empresaId);
  }

  @Patch('empleados/:id')
  actualizarEmpleado(
    @Param('id') id: string,
    @Body() dto: Partial<Empleado>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarEmpleado(id, dto, empresaId);
  }

  @Patch('empleados/:id/baja')
  @ApiOperation({ summary: 'Da de baja al empleado y calcula las partes proporcionales del finiquito' })
  darDeBaja(
    @Param('id') id: string,
    @Body() body: { fecha: string; motivo: string },
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.darDeBajaEmpleado(id, body, empresaId);
  }

  /* ── Puestos ───────────────────────────────────────────────────────────── */

  @Get('puestos')
  listarPuestos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarPuestos(empresaId);
  }

  @Post('puestos')
  crearPuesto(@Body() dto: Partial<Puesto>, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearPuesto(dto, empresaId);
  }

  /* ── Asistencia ────────────────────────────────────────────────────────── */

  @Get('asistencia')
  listarAsistencias(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarAsistencias(empresaId, desde, hasta, empleadoId);
  }

  @Post('asistencia')
  @ApiOperation({ summary: 'Registra entrada o salida; calcula horas trabajadas y extra' })
  registrarAsistencia(
    @Body() dto: { empleadoId: string; fecha: string; entrada?: string; salida?: string; observaciones?: string },
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.registrarAsistencia(dto, empresaId);
  }

  /* ── Incidencias ───────────────────────────────────────────────────────── */

  @Get('incidencias')
  listarIncidencias(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarIncidencias(empresaId, desde, hasta, empleadoId);
  }

  @Post('incidencias')
  crearIncidencia(@Body() dto: Partial<Incidencia>, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearIncidencia(dto, empresaId);
  }

  @Patch('incidencias/:id/aprobar')
  aprobar(
    @Param('id') id: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.aprobarIncidencia(id, usuarioId, empresaId);
  }

  /* ── Conceptos ─────────────────────────────────────────────────────────── */

  @Get('conceptos')
  listarConceptos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarConceptos(empresaId);
  }

  @Post('conceptos/sembrar')
  @ApiOperation({ summary: 'Crea los conceptos mínimos de percepción y deducción' })
  sembrarConceptos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.sembrarConceptos(empresaId);
  }

  /* ── Nómina ────────────────────────────────────────────────────────────── */

  @Get('nomina/periodos')
  listarPeriodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('ejercicio') ejercicio?: string,
  ) {
    return this.svc.listarPeriodos(empresaId, ejercicio ? Number(ejercicio) : undefined);
  }

  @Post('nomina/periodos')
  crearPeriodo(
    @Body() dto: {
      ejercicio: number; numero: number; regimen: RegimenPago;
      fechaInicio: string; fechaFin: string; fechaPago: string;
    },
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearPeriodo(dto, empresaId);
  }

  @Post('nomina/periodos/:id/calcular')
  @ApiOperation({
    summary: 'Calcula la nómina del periodo',
    description: 'Recalcular es seguro: reemplaza los recibos previos dentro de una transacción.',
  })
  calcular(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.calcularNomina(id, empresaId);
  }

  @Patch('nomina/periodos/:id/cerrar')
  cerrar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.cerrarPeriodo(id, empresaId);
  }

  @Get('nomina/recibos')
  listarRecibos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('periodoId') periodoId?: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarRecibos(empresaId, periodoId, empleadoId);
  }

  @Get('nomina/recibos/:id')
  obtenerRecibo(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerRecibo(id, empresaId);
  }
}
