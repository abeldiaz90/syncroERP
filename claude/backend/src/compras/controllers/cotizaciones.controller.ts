import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { CotizacionesService } from '../services/cotizaciones.service';
import { CrearCotizacionDto } from '../dto/crear-cotizacion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { RechazarCotizacionDto, ResolverAprobacionCotizacionDto, SolicitarAprobacionCotizacionDto } from '../dto/decision-cotizacion.dto';

@Controller('compras/cotizaciones')
export class CotizacionesController {
  constructor(private readonly service: CotizacionesService) {}

  @Post()
  crear(@Body() dto: CrearCotizacionDto, @ActiveUser('empresaId') empresaId: string) {
    return this.service.crear(dto, empresaId);
  }

  /*
   * Va ANTES de `:id` porque Nest resuelve por orden de declaracion y
   * `aprobaciones` encajaria como identificador.
   */
  @Get('aprobaciones/pendientes')
  adjudicacionesPendientes(
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.adjudicacionesPendientesDe(usuarioId, rol, empresaId);
  }

  @Get('requisicion/:id')
  obtenerPorRequisicion(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.obtenerPorRequisicion(id, empresaId);
  }

  @Patch(':id/solicitar-aprobacion')
  solicitar(@Param('id') id: string, @Body() dto: SolicitarAprobacionCotizacionDto,
    @ActiveUser('empresaId') empresaId: string, @ActiveUser('id') usuarioId: string) {
    return this.service.solicitarAprobacion(id, empresaId, usuarioId, dto.motivoSeleccion);
  }

  @Patch(':id/aprobar')
  aprobar(@Param('id') id: string, @Body() dto: ResolverAprobacionCotizacionDto,
    @ActiveUser('empresaId') empresaId: string, @ActiveUser('id') usuarioId: string, @ActiveUser('rol') rol: string) {
    return this.service.aprobar(id, empresaId, usuarioId, rol, dto.comentario);
  }

  @Patch(':id/rechazar')
  rechazar(@Param('id') id: string, @Body() dto: RechazarCotizacionDto,
    @ActiveUser('empresaId') empresaId: string, @ActiveUser('id') usuarioId: string, @ActiveUser('rol') rol: string) {
    return this.service.rechazar(id, empresaId, usuarioId, rol, dto.comentario);
  }

  @Patch(':id/seleccionar')
  seleccionar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.seleccionar(id, empresaId);
  }

  @Get(':id')
  obtenerPorId(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.obtenerPorId(id, empresaId);
  }
}
