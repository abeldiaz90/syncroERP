import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { exigirAdministradorDePlataforma } from '../utils/catalogo-global-access';
import { CodigosPostalesService } from '../services/codigos-postales.service';

/**
 * El catálogo se consulta desde cualquier formulario con domicilio, así que la
 * lectura queda abierta a cualquier usuario autenticado: son datos públicos del
 * servicio postal. Solo el estado de las cargas exige administrador, porque
 * dice qué archivo se importó y cuándo.
 */
@Controller('catalogos/codigos-postales')
export class CodigosPostalesController {
  constructor(private readonly service: CodigosPostalesService) {}

  @Get('estatus')
  estatus(@ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.estatus();
  }

  @Get('estados')
  estados() {
    return this.service.estados();
  }

  @Get('municipios')
  municipios(@Query('estado') estadoClave: string) {
    return this.service.municipios(estadoClave);
  }

  @Get('colonias')
  colonias(
    @Query('estado') estadoClave: string,
    @Query('municipio') municipio: string,
  ) {
    return this.service.colonias(estadoClave, municipio);
  }

  /**
   * Va al final a propósito: `:cp` capturaría «estatus», «estados»,
   * «municipios» y «colonias» si se declarara antes. Nest resuelve las rutas en
   * el orden en que se escriben.
   */
  @Get(':cp')
  buscar(@Param('cp') cp: string) {
    return this.service.buscar(cp);
  }
}
