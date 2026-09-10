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
import { ActualizarClienteDto } from './actualizar-cliente.dto';
import { ActiveUser } from '../iam/decorators/active-user.decorator';
import { GestionarCreditoClienteDto } from './gestionar-credito-cliente.dto';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  crear(
    @Body() dto: CrearClienteDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.clientesService.crear(dto, empresaId, usuarioId);
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
    @Body() dto: ActualizarClienteDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.clientesService.actualizar(id, dto, empresaId, usuarioId);
  }

  @Patch(':id/estado')
  toggleActivo(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.clientesService.toggleActivo(id, empresaId, usuarioId);
  }

  @Patch(':id/credito/accion')
  gestionarCredito(
    @Param('id') id: string,
    @Body() dto: GestionarCreditoClienteDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
    @ActiveUser('rol') rol: string,
  ) {
    return this.clientesService.gestionarCredito(
      id,
      dto,
      empresaId,
      usuarioId,
      rol,
    );
  }
}
