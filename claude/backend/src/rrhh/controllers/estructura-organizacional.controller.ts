import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ParseSqlServerGuidPipe } from '../../common/pipes/parse-sql-server-guid.pipe';
import {
  CrearSolicitudEstructuraDto,
  ResolverSolicitudEstructuraDto,
} from '../dto/solicitud-estructura.dto';
import { EstructuraOrganizacionalService } from '../services/estructura-organizacional.service';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';

type UsuarioActivo = { id: string; empresaId: string; rol: string };

@Controller('rrhh/estructura')
@SkipPermisos()
export class EstructuraOrganizacionalController {
  constructor(private readonly service: EstructuraOrganizacionalService) {}

  @Get('solicitudes')
  listar(@ActiveUser() usuario: UsuarioActivo) {
    return this.service.listar(usuario);
  }

  @Post('solicitudes')
  crear(@Body() dto: CrearSolicitudEstructuraDto, @ActiveUser() usuario: UsuarioActivo) {
    return this.service.crear(dto, usuario);
  }

  @Post('solicitudes/:id/gerencia')
  resolverGerencia(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ResolverSolicitudEstructuraDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.service.resolver(id, 'GERENCIA', dto, usuario);
  }

  @Post('solicitudes/:id/finanzas')
  resolverFinanzas(
    @Param('id', ParseSqlServerGuidPipe) id: string,
    @Body() dto: ResolverSolicitudEstructuraDto,
    @ActiveUser() usuario: UsuarioActivo,
  ) {
    return this.service.resolver(id, 'FINANZAS', dto, usuario);
  }
}
