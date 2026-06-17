import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { RequisicionesService } from '../services/requisiciones.service';
import { CrearRequisicionDto } from '../dto/crear-requisicion.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('compras/requisiciones')
export class RequisicionesController {
  constructor(private readonly requisicionesService: RequisicionesService) { }

  @Post()
  async crear(
    @Body() dto: CrearRequisicionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.crear(dto, empresaId);
  }

  @Get()
  async obtenerTodas(@ActiveUser() usuario: any) {
    return this.requisicionesService.obtenerTodas(
      usuario.empresaId,
      usuario.id,
      usuario.rol,
    );
  }

  @Get(':id')
  async obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.obtenerPorId(id, empresaId);
  }

  @Patch(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body('estado') estado: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.cambiarEstado(id, empresaId, estado);
  }

  @Patch('aprobaciones/:id')
  async resolverAprobacion(
    @Param('id') id: string,
    @Body('estado') estado: 'APROBADO' | 'RECHAZADO',
    @Body('comentario') comentario: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.requisicionesService.resolverAprobacion(id, estado, comentario, empresaId);
  }
}