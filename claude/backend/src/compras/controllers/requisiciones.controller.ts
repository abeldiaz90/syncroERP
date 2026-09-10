import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { RequisicionesService } from '../services/requisiciones.service';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { CambiarEstadoRequisicionDto } from '../dto/cambiar-estado-requisicion.dto';
import { ResolverAprobacionRequisicionDto } from '../dto/resolver-aprobacion.dto';

@Controller('compras/requisiciones')
export class RequisicionesController {
  constructor(private readonly requisicionesService: RequisicionesService) {}

  @Navegable('/dashboard/compras/requisiciones', 'Requisiciones', 3)
  @Get()
  async obtenerTodas(@ActiveUser() usuario: any) {
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
