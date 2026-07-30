import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { RequisicionesService } from '../services/requisiciones.service';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { CambiarEstadoRequisicionDto } from '../dto/cambiar-estado-requisicion.dto';

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
  ) {
    return this.requisicionesService.crear(dto, empresaId);
  }

  @Get(':id')
  async obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.obtenerPorId(id, empresaId);
  }

  // ── BUG FIX: este endpoint faltaba — la página de aprobaciones no cargaba ──
  @Navegable('/dashboard/compras/aprobaciones', 'Aprobaciones Pendientes', 5)
  @Get('aprobaciones/pendientes')
  async obtenerAprobacionesPendientes(@ActiveUser('id') usuarioId: string) {
    return this.requisicionesService.obtenerAprobacionesPendientes(usuarioId);
  }

  @Patch(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoRequisicionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.cambiarEstado(
      id,
      empresaId,
      dto.estado,
    );
  }

  // ── NUEVO: cancelar requisición ──────────────────────────────────────────
  @Patch(':id/cancelar')
  async cancelar(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.cambiarEstado(id, empresaId, 'CANCELADA');
  }

  @Patch('aprobaciones/:id')
  async resolverAprobacion(
    @Param('id') id: string,
    @Body('estado') estado: 'APROBADO' | 'RECHAZADO',
    @Body('comentario') comentario: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.resolverAprobacion(
      id,
      estado,
      comentario,
      empresaId,
    );
  }
}
