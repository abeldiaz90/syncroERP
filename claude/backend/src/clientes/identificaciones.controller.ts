import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from '../iam/decorators/active-user.decorator';
import { IdentificacionesService } from './identificaciones.service';
import { GuardarIdentificacionDto } from './identificaciones.dto';

/**
 * Cuelga del cliente y no de una ruta propia: una identificación sin expediente
 * no significa nada, y la ruta lo dice antes de que nadie lea el código.
 */
@Controller('clientes/:clienteId/identificaciones')
export class IdentificacionesController {
  constructor(private readonly servicio: IdentificacionesService) {}

  @Get()
  listar(
    @Param('clienteId') clienteId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.listar(empresaId, clienteId);
  }

  /**
   * Alta y corrección en el mismo verbo.
   *
   * La llave natural es (tipo, folio): capturar la misma credencial otra vez es
   * corregir sus datos, no crear una segunda. Separarlos obligaría a la
   * pantalla a saber de antemano si existe, que es una consulta más para
   * responder algo que el servidor ya sabe.
   */
  @Post()
  guardar(
    @Param('clienteId') clienteId: string,
    @Body() dto: GuardarIdentificacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.guardar(empresaId, clienteId, dto);
  }

  /** Desactiva; no borra. Ver el servicio para el porqué. */
  @Delete(':id')
  eliminar(
    @Param('clienteId') clienteId: string,
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.eliminar(empresaId, clienteId, id);
  }
}
