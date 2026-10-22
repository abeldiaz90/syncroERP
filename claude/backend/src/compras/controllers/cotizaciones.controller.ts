import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ConsultarHistorialAprobacionesDto } from '../../aprobaciones/dto/consultar-historial-aprobaciones.dto';
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

  /** Lo que esta persona ya firmó del lado de las adjudicaciones. */
  @Get('aprobaciones/historial')
  historialDeAdjudicaciones(
    @Query() query: ConsultarHistorialAprobacionesDto,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.historialDeAdjudicaciones(
      usuarioId,
      rol,
      empresaId,
      query.limite,
    );
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

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * AQUÍ HABÍA UN `PATCH :id/seleccionar`, Y NO SELECCIONABA NADA
   * --------------------------------------------------------------------------
   * Su propio servicio lo decía: «No se persiste el cambio de estado: generar
   * la orden de compra es lo que adjudica. Marcarlo aquí sólo bloqueaba ese
   * paso». O sea que validaba y devolvía la cotización igual que estaba.
   *
   * Un PATCH que por diseño no cambia nada miente sobre su verbo: quien lo lee
   * en la lista de rutas cuenta con que marca algo, y lo que marca de verdad
   * es `POST :id/generar-orden`.
   *
   * MEDIDO el 22-oct-2026: no la llamaba nadie. La pantalla de cotizaciones de
   * una requisición usa `solicitar-aprobacion`, `aprobar`, `rechazar` y
   * `generar-orden`, que son los cuatro pasos reales.
   * ═════════════════════════════════════════════════════════════════════════
   */

  @Get(':id')
  obtenerPorId(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.service.obtenerPorId(id, empresaId);
  }
}
