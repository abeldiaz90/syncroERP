/**
 * ============================================================================
 * SyncroERP · Recursos humanos — controlador
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

import { RrhhService } from '../services/rrhh.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import { FIRMAS_NOMINA } from '../advanced/matriz-de-firmas';
import { ParseSqlServerGuidPipe } from '../../common/pipes/parse-sql-server-guid.pipe';
import { EstadoEmpleado } from '../entities/rrhh.entity';
import {
  AsignarCuentaConceptoDto,
  ActualizarConceptoNominaDto, ActualizarEmpleadoDto, ActualizarPuestoDto,
  CrearConceptoNominaDto, CrearContratoLaboralDto, CrearEmpleadoDto, CrearIncidenciaDto,
  CrearParametroNominaDto, CrearPeriodoNominaDto, RechazarIncidenciaDto,
  RegistrarAsistenciaDto, ResolverVacacionesDto, SolicitarVacacionesDto, BajaEmpleadoDto,
} from '../dto/rrhh.dto';

@ApiTags('RRHH')
@ApiBearerAuth('jwt')
@Controller('rrhh')
export class RrhhController {
  constructor(private readonly svc: RrhhService) {}

  /* ── Indicadores ───────────────────────────────────────────────────────── */

  @Get('resumen')
  @ApiOperation({
    summary: 'Plantilla, nómina mensual estimada e incidencias recientes',
  })
  resumen(
    @ActiveUser('empresaId') empresaId: string,
    // El rol decide si los indicadores de coste salen: con plantilla pequena
    // el «salario promedio» es el sueldo de una persona.
    @ActiveUser('rol') rol: string,
  ) {
    return this.svc.resumen(empresaId, rol);
  }

  @Get('preparacion')
  @ApiOperation({ summary: 'Semáforo de requisitos para operar RH y nómina' })
  preparacion(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.preparacion(empresaId);
  }

  /* ── Empleados ─────────────────────────────────────────────────────────── */

  /**
   * El padrón: quién existe, no cómo es su expediente.
   *
   * Media docena de pantallas llaman a `GET /rrhh/empleados` sólo para llenar
   * un selector —«¿a qué empleado le capturo la cuenta bancaria?», «¿de quién
   * es esta incidencia?»— y ese endpoint devuelve la plantilla: sueldo,
   * CURP, RFC, NSS, puesto. Roles que sólo necesitan NOMBRAR a una persona se
   * topaban con un 403 y la pantalla abría con el selector vacío. Le pasó a
   * Tesorería, que tiene que capturar cuentas bancarias y no podía elegir a
   * quién.
   *
   * Esto devuelve lo mínimo para referirse a alguien: número, nombre y estado.
   * Ni sueldo, ni datos fiscales, ni cuenta. Quien necesite el expediente sigue
   * pidiendo `/rrhh/empleados`, que sigue siendo de Recursos humanos.
   */
  @Get('padron')
  @ApiOperation({ summary: 'Padrón mínimo para selectores: número, nombre y estado' })
  listarPadron(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoEmpleado,
  ) {
    return this.svc.listarPadron(empresaId, estado);
  }

  @Get('empleados')
  listarEmpleados(
    @ActiveUser('empresaId') empresaId: string,
    /*
     * El rol viaja hasta el servicio porque decide si el sueldo sale en la
     * lista. `obtenerEmpleado` ya lo recibia; el listado no, y era el que
     * devolvia la plantilla completa de un tiron.
     */
    @ActiveUser('rol') rol: string,
    @Query('estado') estado?: EstadoEmpleado,
    @Query('departamentoId') departamentoId?: string,
    @Query('busqueda') busqueda?: string,
  ) {
    return this.svc.listarEmpleados(
      empresaId,
      { estado, departamentoId, busqueda },
      rol,
    );
  }

  @Post('empleados')
  crearEmpleado(
    @Body() dto: CrearEmpleadoDto,
    @ActiveUser('empresaId') empresaId: string,
    // La cuenta bancaria que nace del alta guarda quién la capturó: validarla
    // es un control de otro, y para eso hay que saber de quién viene.
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.crearEmpleado(dto, empresaId, usuarioId);
  }

  @Get('empleados/:id')
  @ApiOperation({
    summary: 'Ficha del empleado con antigüedad y días de vacaciones por ley',
  })
  obtenerEmpleado(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.svc.obtenerEmpleado(id, empresaId, rol);
  }

  @Patch('empleados/:id')
  actualizarEmpleado(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ActualizarEmpleadoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarEmpleado(id, dto, empresaId);
  }

  @Patch('empleados/:id/baja')
  @ApiOperation({
    summary:
      'Da de baja al empleado y calcula las partes proporcionales del finiquito',
  })
  darDeBaja(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() body: BajaEmpleadoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.darDeBajaEmpleado(id, body, empresaId, usuarioId);
  }

  @Get('empleados/:id/finiquito')
  @ApiOperation({ summary: 'Estima el finiquito sin modificar al empleado' })
  estimarFiniquito(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Query('fecha') fecha: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.estimarFiniquito(id, fecha, empresaId);
  }

  /* ── Puestos ───────────────────────────────────────────────────────────── */

  @Get('puestos')
  listarPuestos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarPuestos(empresaId);
  }

  @Patch('puestos/:id')
  actualizarPuesto(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ActualizarPuestoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarPuesto(id, dto, empresaId);
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
  @ApiOperation({
    summary: 'Registra entrada o salida; calcula horas trabajadas y extra',
  })
  registrarAsistencia(
    @Body() dto: RegistrarAsistenciaDto,
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
  crearIncidencia(
    @Body() dto: CrearIncidenciaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearIncidencia(dto, empresaId);
  }

  @Patch('incidencias/:id/aprobar')
  aprobar(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.aprobarIncidencia(id, usuarioId, empresaId);
  }

  @Patch('incidencias/:id/rechazar')
  rechazar(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: RechazarIncidenciaDto,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.rechazarIncidencia(id, dto.motivo, usuarioId, empresaId);
  }


  /* ── Contratos e historial laboral ────────────────────────────────────── */

  @Get('empleados/:id/contratos')
  listarContratos(@Param('id', ParseSqlServerGuidPipe) id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarContratos(id, empresaId);
  }

  @Post('contratos')
  crearContrato(
    @Body() dto: CrearContratoLaboralDto,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearContratoLaboral(dto, empresaId, usuarioId);
  }

  @Get('empleados/:id/movimientos')
  movimientosLaborales(@Param('id', ParseSqlServerGuidPipe) id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarMovimientosLaborales(id, empresaId);
  }

  /* ── Vacaciones ───────────────────────────────────────────────────────── */

  @Get('vacaciones/solicitudes')
  listarVacaciones(
    @ActiveUser('empresaId') empresaId: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarSolicitudesVacaciones(empresaId, empleadoId);
  }

  @Get('vacaciones/saldo/:empleadoId')
  saldoVacaciones(
    @Param('empleadoId') empleadoId: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.svc.consultarSaldoVacaciones(empleadoId, empresaId, fecha);
  }

  @Post('vacaciones/solicitudes')
  solicitarVacaciones(
    @Body() dto: SolicitarVacacionesDto,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.solicitarVacaciones(dto, empresaId, usuarioId);
  }

  @Patch('vacaciones/solicitudes/:id/resolver')
  resolverVacaciones(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ResolverVacacionesDto,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.svc.resolverVacaciones(id, dto.aprobar, dto.motivo, empresaId, usuarioId, rol);
  }

  /* ── Parámetros de nómina con vigencia ────────────────────────────────── */

  @Get('nomina/parametros')
  listarParametros(
    @ActiveUser('empresaId') empresaId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.svc.listarParametrosNomina(empresaId, fecha);
  }

  @Post('nomina/parametros')
  crearParametro(
    @Body() dto: CrearParametroNominaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearParametroNomina(dto, empresaId);
  }

  /* ── Conceptos ─────────────────────────────────────────────────────────── */

  @Get('conceptos')
  listarConceptos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.listarConceptos(empresaId);
  }

  @Post('conceptos')
  crearConcepto(
    @Body() dto: CrearConceptoNominaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearConcepto(dto, empresaId);
  }

  @Patch('conceptos/:id')
  actualizarConcepto(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ActualizarConceptoNominaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarConcepto(id, dto, empresaId);
  }

  /**
   * A qué cuenta va el gasto de un concepto — decisión de Contabilidad.
   *
   * El concepto lo define Recursos humanos: qué existe, cómo grava, si integra
   * al SBC. La cuenta contable la define quien lleva la contabilidad, igual
   * que el mapa patronal. Por eso es un endpoint aparte y con su propio
   * guardia, en vez de un campo más del `PATCH /conceptos/:id`, que es de RRHH.
   *
   * Sin esto no había forma de ponerla: el campo existía en la base y ninguna
   * pantalla lo pedía, así que la póliza de devengo era imposible para
   * cualquier empresa y cualquier mes.
   */
  @Patch('conceptos/:id/cuenta-contable')
  @Roles(...FIRMAS_NOMINA.cuentaDeConcepto.roles)
  @ApiOperation({ summary: 'Asigna la cuenta contable del concepto (Contabilidad)' })
  asignarCuentaConcepto(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: AsignarCuentaConceptoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.asignarCuentaConcepto(id, dto.cuentaContableId, empresaId);
  }

  @Post('conceptos/sembrar')
  @ApiOperation({
    summary: 'Crea los conceptos mínimos de percepción y deducción',
  })
  sembrarConceptos(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.sembrarConceptos(empresaId);
  }

  /* ── Nómina ────────────────────────────────────────────────────────────── */

  @Get('nomina/periodos')
  listarPeriodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('ejercicio') ejercicio?: string,
  ) {
    return this.svc.listarPeriodos(
      empresaId,
      ejercicio ? Number(ejercicio) : undefined,
    );
  }

  @Post('nomina/periodos')
  crearPeriodo(
    @Body() dto: CrearPeriodoNominaDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearPeriodo(dto, empresaId);
  }

  @Post('nomina/periodos/:id/calcular')
  @ApiOperation({
    summary: 'Calcula la nómina del periodo',
    description:
      'Recalcular es seguro: reemplaza los recibos previos dentro de una transacción.',
  })
  calcular(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.calcularNomina(id, empresaId, usuarioId);
  }

  @Patch('nomina/periodos/:id/cerrar')
  cerrar(@Param('id', ParseSqlServerGuidPipe) id: string, @ActiveUser('empresaId') empresaId: string) {
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
  obtenerRecibo(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerRecibo(id, empresaId);
  }
}
