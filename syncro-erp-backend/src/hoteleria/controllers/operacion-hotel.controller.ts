// hoteleria/controllers/operacion-hotel.controller.ts
import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { OperacionHotelService } from '../services/operacion-hotel.service';
import {
  CrearReservacionDto,
  CheckInDto,
  AgregarConsumoDto,
} from '../dto/hoteleria.dtos';

@Controller('hoteleria/operacion')
export class OperacionHotelController {
  constructor(private readonly svc: OperacionHotelService) {}

  @Post('reservaciones')
  crear(@Body() dto: CrearReservacionDto, @ActiveUser('empresaId') e: string) {
    return this.svc.crearReservacion(dto, e);
  }

  @Get('reservaciones')
  listar(
    @Query('hotelId') hotelId: string,
    @ActiveUser('empresaId') e: string,
  ) {
    return this.svc.obtenerReservaciones(e, hotelId);
  }

  @Get('reservaciones/:id')
  detalle(@Param('id') id: string, @ActiveUser('empresaId') e: string) {
    return this.svc.obtenerReservacion(id, e);
  }

  @Post('reservaciones/:id/check-in')
  checkIn(
    @Param('id') id: string,
    @Body() dto: CheckInDto,
    @ActiveUser('empresaId') e: string,
  ) {
    return this.svc.checkIn(id, dto, e);
  }

  @Post('reservaciones/:id/check-out')
  checkOut(@Param('id') id: string, @ActiveUser('empresaId') e: string) {
    return this.svc.checkOut(id, e);
  }

  @Post('reservaciones/:id/consumo')
  consumo(
    @Param('id') id: string,
    @Body() dto: AgregarConsumoDto,
    @ActiveUser('empresaId') e: string,
  ) {
    return this.svc.agregarConsumo(id, dto, e);
  }

  @Get('reservaciones/:id/folio')
  folio(@Param('id') id: string, @ActiveUser('empresaId') e: string) {
    return this.svc.obtenerFolio(id, e);
  }
}
