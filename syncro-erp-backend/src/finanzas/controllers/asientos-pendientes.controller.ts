import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AsientosPendientesService } from '../services/asientos-pendientes.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { EstadoAsiento } from '../entities/asiento-pendiente.entity';

@ApiTags('Finanzas')
@ApiBearerAuth('jwt')
@Controller('finanzas/asientos-pendientes')
export class AsientosPendientesController {
  constructor(private readonly svc: AsientosPendientesService) {}

  @Get()
  @ApiOperation({ summary: 'Asientos contables que no pudieron generarse' })
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('estado') estado?: EstadoAsiento,
  ) {
    return this.svc.listar(empresaId, estado);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Conteo por estado; `requierenAtencion` es lo que hay que revisar' })
  resumen(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.resumen(empresaId);
  }

  @Post(':id/reintentar')
  @ApiOperation({
    summary: 'Reintenta generar el asiento',
    description: 'Úsalo después de corregir la configuración que causó la falla.',
  })
  reintentar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.reintentarAhora(id, empresaId);
  }

  @Post(':id/descartar')
  @ApiOperation({ summary: 'Descarta el asiento; exige justificación' })
  descartar(
    @Param('id') id: string,
    @Body() body: { nota: string },
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.descartar(id, body.nota, usuarioId, empresaId);
  }
}
