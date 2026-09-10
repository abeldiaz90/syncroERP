import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { ConsultarHistorialAprobacionesDto } from '../dto/consultar-historial-aprobaciones.dto';
import { ResolverAprobacionDocumentoDto } from '../dto/resolver-aprobacion-documento.dto';
import { AprobacionesDocumentosService } from '../services/aprobaciones-documentos.service';

@Controller('aprobaciones')
export class AprobacionesDocumentosController {
  constructor(private readonly service: AprobacionesDocumentosService) {}

  @Get('pendientes')
  @Navegable('/dashboard/aprobaciones', 'Bandeja central de aprobaciones', 8)
  pendientes(
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.service.listarPendientes(empresaId, usuarioId, rol);
  }


  @Get('historial')
  @Navegable('/dashboard/aprobaciones', 'Bandeja central de aprobaciones', 8)
  historial(
    @Query() query: ConsultarHistorialAprobacionesDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.service.listarHistorial(empresaId, query.limite);
  }

  @Patch(':id/resolver')
  resolver(
    @Param('id') id: string,
    @Body() dto: ResolverAprobacionDocumentoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.service.resolver(id, dto, empresaId, {
      id: usuarioId,
      rol,
    });
  }
}
