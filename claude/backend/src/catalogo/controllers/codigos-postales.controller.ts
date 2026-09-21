import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { exigirAdministradorDePlataforma } from '../utils/catalogo-global-access';
import { CodigosPostalesService } from '../services/codigos-postales.service';

/**
 * El catálogo se consulta desde cualquier formulario con domicilio, así que la
 * lectura queda abierta a cualquier usuario autenticado: son datos públicos del
 * servicio postal. Solo el estado de las cargas exige administrador, porque
 * dice qué archivo se importó y cuándo.
 *
 * Esto estaba ESCRITO aquí pero no implementado: las rutas seguían resolviendose
 * por el contrato de roles y respondían 403 a todo el que no fuera
 * administración. Verificado el 21-sep-2026 con el comprador: los cinco GET
 * negados, y con ellos la resolución de domicilio por CP en los formularios de
 * cliente y proveedor. Un comentario no es un permiso; ahora lo dice
 * @SkipPermisos().
 */
@Controller('catalogos/codigos-postales')
export class CodigosPostalesController {
  constructor(private readonly service: CodigosPostalesService) {}

  @Get('estatus')
  estatus(@ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.estatus();
  }

  @SkipPermisos()
  @Get('estados')
  estados() {
    return this.service.estados();
  }

  @SkipPermisos()
  @Get('municipios')
  municipios(@Query('estado') estadoClave: string) {
    return this.service.municipios(estadoClave);
  }

  @SkipPermisos()
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
  @SkipPermisos()
  @Get(':cp')
  buscar(@Param('cp') cp: string) {
    return this.service.buscar(cp);
  }
}
