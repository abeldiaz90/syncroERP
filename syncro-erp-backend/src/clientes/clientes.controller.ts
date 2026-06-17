import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './crear-cliente.dto';
import { ActiveUser } from '../iam/decorators/active-user.decorator';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  crear(
    @Body() dto: CrearClienteDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.clientesService.crear(dto, empresaId);
  }

  @Get()
  obtenerTodos(
    @ActiveUser('empresaId') empresaId: string,
    @Query('filtro') filtro?: string,
    @Query('activos') activos?: string,
  ) {
    const soloActivos = activos !== 'false';
    return this.clientesService.obtenerTodos(empresaId, filtro, soloActivos);
  }

  @Get(':id')
  obtenerPorId(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.clientesService.obtenerPorId(id, empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: Partial<CrearClienteDto>,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.clientesService.actualizar(id, dto, empresaId);
  }

  @Patch(':id/estado')
  toggleActivo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.clientesService.toggleActivo(id, empresaId);
  }
}