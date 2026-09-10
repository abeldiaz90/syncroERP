import { Controller, Get, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { DisponibilidadService } from '../services/disponibilidad.service';

@Controller('hoteleria/disponibilidad')
export class DisponibilidadController {
  constructor(private readonly disponibilidad: DisponibilidadService) {}

  @Get()
  consultar(
    @Query('fechaEntrada') fechaEntrada: string,
    @Query('fechaSalida') fechaSalida: string,
    @Query('hotelId') hotelId: string | undefined,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.disponibilidad.consultar(
      empresaId,
      fechaEntrada,
      fechaSalida,
      hotelId,
    );
  }

  @Get('ocupacion')
  ocupacion(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('hotelId') hotelId: string | undefined,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.disponibilidad.ocupacionPorDia(
      empresaId,
      desde,
      hasta,
      hotelId,
    );
  }
}
