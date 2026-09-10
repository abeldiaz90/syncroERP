import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ParseSqlServerGuidPipe } from '../../common/pipes/parse-sql-server-guid.pipe';
import {
  ActualizarCuentaBancariaEmpleadoDto,
  ConceptoEmpleadoDto,
  ConciliarDispersionDto,
  ConfiguracionPatronalDto,
  CuentaBancariaEmpleadoDto,
  GenerarCfdiDto,
  GenerarDispersionDto,
  MarcarDispersionEnviadaDto,
  ObligacionEmpleadoDto,
  PrepararAprobacionDto,
  PrestamoDto,
  RegistrarPagoNominaDto,
  ResolverAprobacionDto,
  ResultadoPacDto,
  ValidarCuentaBancariaDto,
} from './nomina-avanzada.dto';
import { NominaAvanzadaService } from './nomina-avanzada.service';

interface UsuarioActivo {
  id: string;
  rol: string;
  email?: string;
  empresaId: string;
}

@ApiTags('Nómina avanzada')
@ApiBearerAuth('jwt')
@Controller('rrhh/nomina-avanzada')
export class NominaAvanzadaController {
  constructor(private readonly svc: NominaAvanzadaService) {}

  @Get('tablero')
  tablero(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.tablero(empresaId);
  }

  @Get('configuracion')
  configuracion(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerConfiguracion(empresaId);
  }

  @Post('configuracion')
  guardarConfig(
    @Body() dto: ConfiguracionPatronalDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.guardarConfiguracion(dto, usuario.empresaId, usuario);
  }

  @Get('conceptos-empleado')
  listaConceptos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarConceptosEmpleado(empresaId, empleadoId);
  }

  @Post('conceptos-empleado')
  asignar(
    @Body() dto: ConceptoEmpleadoDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.asignarConcepto(dto, usuario.empresaId, usuario);
  }

  @Get('prestamos')
  listaPrestamos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarPrestamos(empresaId, empleadoId);
  }

  @Post('prestamos')
  crearPrestamo(
    @Body() dto: PrestamoDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.crearPrestamo(dto, usuario.empresaId, usuario);
  }

  @Get('obligaciones')
  obligaciones(
    @ActiveUser('empresaId') empresaId: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarObligaciones(empresaId, empleadoId);
  }

  @Post('obligaciones')
  crearObligacion(
    @Body() dto: ObligacionEmpleadoDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.crearObligacion(dto, usuario.empresaId, usuario);
  }

  @Get('cuentas-bancarias')
  cuentasBancarias(
    @ActiveUser('empresaId') empresaId: string,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarCuentasBancarias(empresaId, empleadoId);
  }

  @Post('cuentas-bancarias/migrar-cifrado')
  migrarCifradoCuentas(@ActiveUser() usuario: UsuarioActivo) {
    return this.svc.migrarCuentasBancariasLegadas(usuario, usuario.empresaId);
  }

  @Post('cuentas-bancarias')
  crearCuentaBancaria(
    @Body() dto: CuentaBancariaEmpleadoDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.crearCuentaBancaria(dto, usuario, usuario.empresaId);
  }

  @Patch('cuentas-bancarias/:id')
  actualizarCuentaBancaria(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ActualizarCuentaBancariaEmpleadoDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.actualizarCuentaBancaria(id, dto, usuario, usuario.empresaId);
  }

  @Patch('cuentas-bancarias/:id/validar')
  validarCuentaBancaria(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ValidarCuentaBancariaDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.validarCuentaBancaria(id, dto, usuario, usuario.empresaId);
  }

  @Get('periodos/:id/prenomina')
  prenomina(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.prenomina(id, empresaId);
  }

  @Post('periodos/:id/aprobaciones/preparar')
  preparar(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: PrepararAprobacionDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.prepararAprobacion(
      id,
      usuario.empresaId,
      dto.niveles,
      dto.aceptarAlertas,
      usuario,
    );
  }

  @Get('periodos/:id/aprobaciones')
  aprobaciones(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.listarAprobaciones(id, empresaId);
  }

  @Patch('aprobaciones/:id')
  resolver(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ResolverAprobacionDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.resolverAprobacion(
      id,
      dto.estado,
      dto.comentario,
      usuario,
      usuario.empresaId,
    );
  }

  @Post('periodos/:id/cfdi/generar')
  generarCfdi(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: GenerarCfdiDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.generarCfdiBorradores(
      id,
      usuario.empresaId,
      dto.enviarPac,
      usuario,
    );
  }

  @Get('periodos/:id/cfdi')
  cfdis(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.listarCfdis(id, empresaId);
  }

  @Patch('cfdi/:id/resultado-pac')
  resultadoPac(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ResultadoPacDto,
    @Headers('x-nomina-pac-secret') secret: string | undefined,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.registrarResultadoPac(id, dto, empresaId, secret);
  }

  @Post('periodos/:id/dispersion')
  generarDispersion(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: GenerarDispersionDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.generarDispersion(id, dto, usuario, usuario.empresaId);
  }

  @Patch('periodos/:id/dispersion/enviada')
  marcarDispersionEnviada(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: MarcarDispersionEnviadaDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.marcarDispersionEnviada(id, dto, usuario, usuario.empresaId);
  }

  @Get('periodos/:id/dispersion')
  dispersion(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerDispersion(id, empresaId);
  }

  @Patch('periodos/:id/dispersion/conciliar')
  conciliarDispersion(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ConciliarDispersionDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.conciliarDispersion(id, dto, usuario, usuario.empresaId);
  }

  @Post('periodos/:id/pago')
  pagar(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: RegistrarPagoNominaDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.registrarPago(id, dto, usuario, usuario.empresaId);
  }

  @Get('periodos/:id/pago')
  pago(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPago(id, empresaId);
  }

  @Post('periodos/:id/poliza-detallada')
  generarPoliza(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.generarPolizaDetallada(id, usuario, usuario.empresaId);
  }

  @Get('periodos/:id/poliza-detallada')
  poliza(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.listarPoliza(id, empresaId);
  }

  @Post('periodos/:id/cierre-financiero')
  cerrar(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.svc.cerrar(id, usuario.empresaId, usuario);
  }

  @Get('periodos/:id/cumplimiento')
  cumplimiento(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.tableroCumplimiento(id, empresaId);
  }
}
