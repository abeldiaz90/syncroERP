import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import {
  CrearFlujoDto,
  EjecutarValidacionDto,
  SimularValidacionDto,
} from './dto/flujo-validacion.dto';
import { FlujosValidacionService } from './services/flujos-validacion.service';
import { MotorValidacionService } from './services/motor-validacion.service';

/**
 * Diseño y ejecución de los flujos de validación previos al crédito.
 *
 * Diseñar el flujo es potestad del administrador de la empresa: define quién
 * puede recibir crédito. Ejecutarlo lo puede hacer quien origina.
 */
@Controller('integracion/validacion')
export class ValidacionController {
  constructor(
    private readonly flujos: FlujosValidacionService,
    private readonly motor: MotorValidacionService,
  ) {}

  // ── Diseño del flujo ─────────────────────────────────────────────────────

  @Get('flujos')
  @Roles('administrador', 'direccion', 'gerencia')
  listar(@ActiveUser('empresaId') empresaId: string) {
    return this.flujos.listar(empresaId);
  }

  /** Punto de partida sugerido para que nadie empiece con una hoja en blanco. */
  @Get('flujos/plantilla')
  @Roles('administrador', 'direccion', 'gerencia')
  plantilla() {
    return {
      nombre: 'Originación de crédito',
      descripcion:
        'Secuencia sugerida. Revísala y ajústala antes de activarla; no se instala sola.',
      topeAutomatico: 0,
      puntajeMinimo: 60,
      pasos: this.flujos.plantillaSugerida(),
    };
  }

  @Get('flujos/activo')
  activo(@ActiveUser('empresaId') empresaId: string) {
    return this.motor.flujoActivo(empresaId);
  }

  @Get('flujos/:id')
  @Roles('administrador', 'direccion', 'gerencia')
  obtener(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.flujos.obtener(id, empresaId);
  }

  @Post('flujos')
  @Roles('administrador', 'direccion')
  crear(
    @Body() dto: CrearFlujoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.flujos.crear(empresaId, { ...dto, usuarioId });
  }

  @Patch('flujos/:id/activar')
  @Roles('administrador', 'direccion')
  activar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.flujos.activar(id, empresaId);
  }

  @Patch('flujos/:id/desactivar')
  @Roles('administrador', 'direccion')
  desactivar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.flujos.desactivar(id, empresaId);
  }

  // ── Ejecución ────────────────────────────────────────────────────────────

  /**
   * Corre el flujo sobre un cliente real. Produce un expediente y un veredicto;
   * no otorga nada. Quien autoriza sigue siendo el flujo de aprobaciones.
   */
  @Post('ejecutar')
  @Roles('administrador', 'direccion', 'gerencia', 'cobranza')
  ejecutar(
    @Body() dto: EjecutarValidacionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.motor.ejecutar({
      empresaId,
      clienteId: dto.clienteId,
      limiteSolicitado: dto.limiteSolicitado,
      folioAutorizacionBuro: dto.folioAutorizacionBuro ?? null,
      usuarioId,
    });
  }

  /**
   * Igual que ejecutar, pero permite forzar la respuesta de cada paso para ver
   * cómo se comporta el flujo antes de que existan los proveedores. El
   * expediente queda marcado como simulación.
   */
  @Post('simular')
  @Roles('administrador', 'direccion', 'gerencia')
  simular(
    @Body() dto: SimularValidacionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.motor.ejecutar({
      empresaId,
      clienteId: dto.clienteId,
      limiteSolicitado: dto.limiteSolicitado,
      folioAutorizacionBuro: dto.folioAutorizacionBuro ?? null,
      usuarioId,
      simulacion: true,
      simulado: dto.simulado,
    });
  }

  @Get('expedientes/:id')
  @Roles('administrador', 'direccion', 'gerencia', 'cobranza')
  expediente(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.motor.expediente(id, empresaId);
  }

  @Get('expedientes')
  @Roles('administrador', 'direccion', 'gerencia', 'cobranza')
  historial(
    @ActiveUser('empresaId') empresaId: string,
    @Query('clienteId') clienteId: string,
  ) {
    return this.motor.historial(empresaId, clienteId);
  }
}
