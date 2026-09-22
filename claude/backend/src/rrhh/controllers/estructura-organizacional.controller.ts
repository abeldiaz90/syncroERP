import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ParseSqlServerGuidPipe } from '../../common/pipes/parse-sql-server-guid.pipe';
import {
  CrearSolicitudEstructuraDto,
  ResolverSolicitudEstructuraDto,
} from '../dto/solicitud-estructura.dto';
import { EstructuraOrganizacionalService } from '../services/estructura-organizacional.service';

type UsuarioActivo = { id: string; empresaId: string; rol: string };

/*
 * ============================================================================
 * AQUI HABIA UN `@SkipPermisos()`. Se quito el 22-sep-2026.
 * ----------------------------------------------------------------------------
 * Saltarse la tabla de permisos no dejaba el modulo abierto —el servicio
 * comprueba el rol en cada metodo— pero si lo dejaba INVISIBLE: el menu se
 * construye con los permisos que uno TIENE, y estos endpoints no existian en
 * la tabla, asi que no los tenia nadie. La pantalla de aprobaciones de
 * estructura no aparecia en el menu de ningun rol salvo el administrador, que
 * salta la tabla entera.
 *
 * Y son tres roles los que la necesitan: RRHH levanta la solicitud, Gerencia
 * firma la primera etapa y Finanzas la segunda. Ninguno podia llegar a la
 * pantalla. Comprobado en vivo el 22-sep: se levanto una solicitud de puesto
 * real desde RRHH, la API la devolvia con 200, y la pantalla contestaba «esta
 * seccion no esta en tu perfil». Por eso este flujo no se habia ejercido nunca
 * —y sin puestos no se puede dar de alta al primer empleado—.
 *
 * Ahora entra en el catalogo como todo lo demas. La comprobacion de rol del
 * servicio se queda: son las dos autorizaciones de siempre, y las dos tienen
 * que decir que si.
 * ============================================================================
 */
@Controller('rrhh/estructura')
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
