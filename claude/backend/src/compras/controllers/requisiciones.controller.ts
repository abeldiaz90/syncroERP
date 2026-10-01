import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConsultarHistorialAprobacionesDto } from '../../aprobaciones/dto/consultar-historial-aprobaciones.dto';
import {
  RequisicionesService,
  alcanceDeRequisiciones,
} from '../services/requisiciones.service';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { CambiarEstadoRequisicionDto } from '../dto/cambiar-estado-requisicion.dto';
import { ResolverAprobacionRequisicionDto } from '../dto/resolver-aprobacion.dto';

@Controller('compras/requisiciones')
export class RequisicionesController {
  constructor(private readonly requisicionesService: RequisicionesService) {}

  @Navegable('/dashboard/compras/requisiciones', 'Requisiciones', 3)
  /**
   * El listado, y CUÁNTO listado es.
   *
   * A quien no es Compras ni administrador se le devuelven únicamente sus
   * requisiciones. La cabecera `X-Alcance` lo dice en voz alta para que la
   * pantalla no tenga que adivinarlo ni repetir la regla por su cuenta: una
   * lista vacía con alcance `propias` significa «tú no tienes», no «no hay».
   */
  @Get()
  async obtenerTodas(
    @ActiveUser() usuario: any,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    respuesta.setHeader('X-Alcance', alcanceDeRequisiciones(usuario.rol));
    respuesta.setHeader('Access-Control-Expose-Headers', 'X-Alcance');
    return this.requisicionesService.obtenerTodas(
      usuario.empresaId,
      usuario.id,
      usuario.rol,
    );
  }

  @Post()
  async crear(
    @Body() dto: CrearRequisicionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.requisicionesService.crear(dto, empresaId, usuarioId);
  }

  // ── BUG FIX: este endpoint faltaba — la página de aprobaciones no cargaba ──
  @Navegable('/dashboard/compras/aprobaciones', 'Aprobaciones Pendientes', 5)
  @Get('aprobaciones/pendientes')
  async obtenerAprobacionesPendientes(
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.obtenerAprobacionesPendientes(
      usuarioId,
      empresaId,
    );
  }

  /**
   * Lo que esta persona ya firmó.
   *
   * Va declarado junto a `pendientes` y las dos antes de `:id`. Hoy no chocan
   * —`aprobaciones/historial` son dos segmentos y `:id` uno— pero Nest resuelve
   * por orden de declaración, y mantener juntas las rutas de la bandeja evita
   * que la siguiente que se agregue caiga del lado equivocado.
   *
   * Se declara `@Navegable` con la MISMA pantalla que `pendientes`: no es una
   * pantalla nueva, es la otra pestaña de la misma. Declararla como pantalla
   * aparte habría puesto una entrada de menú que no existe.
   */
  @Navegable('/dashboard/compras/aprobaciones', 'Aprobaciones Pendientes', 5)
  @Get('aprobaciones/historial')
  async obtenerHistorialAprobaciones(
    @Query() query: ConsultarHistorialAprobacionesDto,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.requisicionesService.obtenerHistorialAprobaciones(
      usuarioId,
      empresaId,
      rol,
      query.limite,
    );
  }

  @Get(':id')
  async obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.requisicionesService.obtenerPorId(
      id,
      empresaId,
      usuarioId,
      rol,
    );
  }

  @Patch(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoRequisicionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.requisicionesService.cambiarEstado(
      id,
      empresaId,
      dto.estado,
      usuarioId,
      rol,
    );
  }

  // ── NUEVO: cancelar requisición ──────────────────────────────────────────
  @Patch(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.requisicionesService.cambiarEstado(
      id,
      empresaId,
      'CANCELADA',
      usuarioId,
      rol,
    );
  }

  @Patch('aprobaciones/:id')
  async resolverAprobacion(
    @Param('id') id: string,
    @Body() dto: ResolverAprobacionRequisicionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.requisicionesService.resolverAprobacion(
      id, dto.estado, dto.comentario, empresaId, usuarioId,
    );
  }
}
