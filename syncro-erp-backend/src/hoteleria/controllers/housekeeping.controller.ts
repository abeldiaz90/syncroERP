// hoteleria/controllers/housekeeping.controller.ts
import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { HousekeepingService } from '../services/housekeeping.service';
import { EstadoTarea } from '../entities/tarea-housekeeping.entity';
import { EstadoHabitacion } from '../entities/habitacion.entity';
import { AsignarCamaristaDto } from '../dto/hoteleria.dtos';

@Controller('hoteleria/housekeeping')
export class HousekeepingController {
  constructor(private readonly svc: HousekeepingService) {}

  // Rack visual de habitaciones
  @Get('rack')
  rack(@Query('hotelId') hotelId: string, @ActiveUser('empresaId') e: string) {
    return this.svc.obtenerRack(hotelId, e);
  }

  // Tareas de limpieza
  @Get('tareas')
  tareas(@Query('estado') estado: EstadoTarea, @ActiveUser('empresaId') e: string) {
    return this.svc.obtenerTareas(e, estado);
  }

  @Patch('tareas/:id/asignar')
  asignar(@Param('id') id: string, @Body() dto: AsignarCamaristaDto, @ActiveUser('empresaId') e: string) {
    return this.svc.asignarCamarista(id, dto, e);
  }

  @Post('tareas/:id/iniciar')
  iniciar(@Param('id') id: string, @ActiveUser('empresaId') e: string) {
    return this.svc.iniciarTarea(id, e);
  }

  @Post('tareas/:id/terminar')
  terminar(@Param('id') id: string, @ActiveUser('empresaId') e: string) {
    return this.svc.terminarTarea(id, e);
  }

  // Cambiar estado de habitación manualmente
  @Patch('habitaciones/:id/estado')
  cambiarEstado(
    @Param('id') id: string,
    @Body('estado') estado: EstadoHabitacion,
    @ActiveUser('empresaId') e: string,
  ) {
    return this.svc.cambiarEstadoHabitacion(id, estado, e);
  }

  // Devuelve a qué estados puede pasar una habitación desde su estado actual
  @Get('transiciones/:estado')
  transiciones(@Param('estado') estado: string) {
    return { estado, validas: this.svc.transicionesValidas(estado) };
  }
}