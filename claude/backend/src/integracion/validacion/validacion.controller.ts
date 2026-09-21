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
  EditarFlujoDto,
  EjecutarValidacionDto,
  SimularValidacionDto,
} from './dto/flujo-validacion.dto';
import { ConfigService } from '@nestjs/config';
import { FlujosValidacionService } from './services/flujos-validacion.service';
import { MotorValidacionService } from './services/motor-validacion.service';
import { TIPOS_PASO_CONTRATABLES } from './validacion.constants';

/**
 * Diseño y ejecución de los flujos de validación previos al crédito.
 *
 * Diseñar el flujo es potestad del administrador de la empresa: define quién
 * puede recibir crédito. Ejecutarlo lo puede hacer quien origina.
 */
@Controller('integracion/validacion')
export class ValidacionController {
  constructor(
    private readonly cfg: ConfigService,
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
  /**
   * Qué capacidades de validación tiene contratadas esta empresa.
   *
   * Las gobierna la consola de SUMA, igual que los modos de contratación. El
   * ERP sólo las lee, para no ofrecer en el diseñador pasos que después no se
   * podrán activar.
   */
  @Get('capacidades')
  @Roles('administrador', 'direccion', 'gerencia')
  async capacidades(@ActiveUser('empresaId') empresaId: string) {
    const contratadas = await this.flujos.capacidadesContratadas(empresaId);
    return {
      contratables: TIPOS_PASO_CONTRATABLES,
      contratadas,
      sinRestriccion: contratadas === null,
      nota:
        contratadas === null
          ? 'SUMA no ha declarado capacidades para esta empresa, así que no se restringe ninguna.'
          : 'Los pasos fuera de esta lista pueden diseñarse pero no activarse.',
    };
  }

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
    return this.flujos.crear(empresaId, {
      ...dto,
      usuarioId,
      topeInstalacion: Number(this.cfg.get('CREDITO_TOPE_AUTOMATICO') ?? 0),
    });
  }

  @Patch('flujos/:id')
  @Roles('administrador', 'direccion')
  editar(
    @Param('id') id: string,
    @Body() dto: EditarFlujoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.flujos.editar(id, empresaId, {
      ...dto,
      topeInstalacion: Number(this.cfg.get('CREDITO_TOPE_AUTOMATICO') ?? 0),
    });
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

  /**
   * El agregado de la empresa: cuánto se verifica, de qué y con qué resultado.
   * Va antes que `expedientes/:id` porque Nest resuelve por orden y una ruta
   * fija tiene que declararse antes que una con parámetro.
   */
  @Get('tablero')
  @Roles('administrador', 'direccion', 'gerencia', 'cobranza')
  tablero(
    @ActiveUser('empresaId') empresaId: string,
    @Query('dias') dias?: string,
  ) {
    return this.motor.tablero(empresaId, Number(dias ?? 90));
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
