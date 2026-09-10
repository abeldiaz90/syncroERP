import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { ConfiguracionHotelService } from '../services/configuracion-hotel.service';
import {
  ActualizarHabitacionDto,
  ActualizarHotelDto,
  ActualizarTipoHabitacionDto,
  CrearHabitacionDto,
  CrearHabitacionesLoteDto,
  CrearHotelDto,
  CrearTipoHabitacionDto,
  GuardarDotacionDto,
} from '../dto/hoteleria.dtos';

@Controller('hoteleria/config')
export class ConfiguracionHotelController {
  constructor(private readonly svc: ConfiguracionHotelService) {}

  @Post('hoteles')
  crearHotel(@Body() dto: CrearHotelDto, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearHotel(dto, empresaId);
  }

  @Get('hoteles')
  hoteles(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerHoteles(empresaId);
  }

  @Patch('hoteles/:id')
  actHotel(
    @Param('id') id: string,
    @Body() dto: ActualizarHotelDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarHotel(id, dto, empresaId);
  }

  @Post('tipos')
  crearTipo(@Body() dto: CrearTipoHabitacionDto, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearTipo(dto, empresaId);
  }

  @Get('tipos')
  tipos(@Query('hotelId') hotelId: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerTipos(hotelId, empresaId);
  }

  @Patch('tipos/:id')
  actTipo(
    @Param('id') id: string,
    @Body() dto: ActualizarTipoHabitacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarTipo(id, dto, empresaId);
  }

  @Post('habitaciones')
  crearHab(@Body() dto: CrearHabitacionDto, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearHabitacion(dto, empresaId);
  }

  @Post('habitaciones/lote')
  crearLote(@Body() dto: CrearHabitacionesLoteDto, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crearHabitacionesLote(dto, empresaId);
  }

  @Get('habitaciones')
  habitaciones(@Query('hotelId') hotelId: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerHabitaciones(hotelId, empresaId);
  }

  @Patch('habitaciones/:id')
  actHab(
    @Param('id') id: string,
    @Body() dto: ActualizarHabitacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.actualizarHabitacion(id, dto, empresaId);
  }

  @Post('dotacion')
  guardarDotacion(@Body() dto: GuardarDotacionDto, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.guardarDotacion(dto, empresaId);
  }

  @Get('dotacion')
  dotacion(@Query('tipoHabitacionId') tipoId: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerDotacion(tipoId, empresaId);
  }

  @Post('precargar-demo')
  precargarDemo(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.precargarDemo(empresaId);
  }
}
