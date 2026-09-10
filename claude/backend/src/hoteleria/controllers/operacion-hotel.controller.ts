import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { OperacionHotelService } from '../services/operacion-hotel.service';
import {
  AgregarConsumoDto,
  CambiarHabitacionDto,
  CancelarReservacionDto,
  CheckInDto,
  CheckOutDto,
  CrearReservacionDto,
} from '../dto/hoteleria.dtos';

@Controller('hoteleria/operacion')
export class OperacionHotelController {
  constructor(private readonly svc: OperacionHotelService) {}

  @Post('reservaciones')
  crear(
    @Body() dto: CrearReservacionDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.crearReservacion(dto, empresaId);
  }

  @Get('reservaciones')
  listar(
    @Query('hotelId') hotelId: string | undefined,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerReservaciones(empresaId, hotelId);
  }

  @Get('panel')
  panel(
    @Query('hotelId') hotelId: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.obtenerPanel(hotelId, empresaId);
  }

  @Get('reservaciones/:id')
  detalle(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerReservacion(id, empresaId);
  }

  @Post('reservaciones/:id/check-in')
  checkIn(
    @Param('id') id: string,
    @Body() dto: CheckInDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.checkIn(id, dto, empresaId, usuarioId);
  }

  @Patch('reservaciones/:id/cancelar')
  cancelar(
    @Param('id') id: string,
    @Body() dto: CancelarReservacionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.cancelarReservacion(id, dto, empresaId, usuarioId);
  }

  @Patch('reservaciones/:id/no-show')
  noShow(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.marcarNoShow(id, empresaId, usuarioId);
  }

  @Patch('reservaciones/:id/cambiar-habitacion')
  cambiarHabitacion(
    @Param('id') id: string,
    @Body() dto: CambiarHabitacionDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.cambiarHabitacion(id, dto, empresaId, usuarioId);
  }

  @Post('reservaciones/:id/check-out')
  checkOut(
    @Param('id') id: string,
    @Body() dto: CheckOutDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.checkOut(id, dto, empresaId, usuarioId);
  }

  @Post('reservaciones/:id/consumo')
  consumo(
    @Param('id') id: string,
    @Body() dto: AgregarConsumoDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.agregarConsumo(id, dto, empresaId, usuarioId);
  }

  @Get('reservaciones/:id/folio')
  folio(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerFolio(id, empresaId);
  }
}
