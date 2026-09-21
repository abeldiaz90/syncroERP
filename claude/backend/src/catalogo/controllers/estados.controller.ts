import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';
import { exigirAdministradorDePlataforma } from '../utils/catalogo-global-access';
import { EstadosService } from '../services/estados.service';
import { CrearEstadoDto } from '../dto/crear-estado.dto';
import { ActualizarEstadoDto } from '../dto/actualizar-estado.dto';

@Controller('catalogos/estados')
export class EstadosController {
  constructor(private readonly service: EstadosService) {}

  /**
   * CATALOGO DE REFERENCIA: la lectura esta abierta a cualquier sesion valida.
   *
   * Paises, estados, bancos, formas de pago SAT y codigos postales no son datos
   * de nadie: son la lista contra la que se llena CUALQUIER formulario con
   * domicilio o con datos de pago. Mientras se resolvian por el contrato de
   * roles, cada rol que no fuera administracion los recibia en 403.
   *
   * El efecto se vio el 21-sep-2026 con el comprador, que es precisamente quien
   * mantiene el padron de proveedores: al abrir el alta, los combos Pais, Estado
   * y Forma de Pago salian vacios ESTANDO MARCADOS COMO OBLIGATORIOS. No es que
   * la pantalla se viera mal: el proveedor no se podia dar de alta, y la pantalla
   * no explicaba por que. Lo mismo dejaba sin servicio la resolucion de domicilio
   * por codigo postal en todos los formularios de cliente y proveedor.
   *
   * Que estos catalogos se leen sin permiso es una regla del sistema, no una
   * concesion a un rol: agregarla al contrato rol por rol garantiza que el
   * proximo rol nazca roto otra vez. La ESCRITURA no se toca y sigue exigiendo
   * administrador de plataforma.
   */
  @SkipPermisos()
  @Get()
  findByPais(
    @Query('paisId') paisId?: string,
    @Query('activos') activos?: string,
  ) {
    return this.service.findByPais(paisId, activos !== 'false');
  }

  @Post()
  create(@Body() dto: CrearEstadoDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ActualizarEstadoDto, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  toggle(@Param('id') id: string, @ActiveUser('rol') rol: string) {
    exigirAdministradorDePlataforma(rol);
    return this.service.toggle(id);
  }
}
