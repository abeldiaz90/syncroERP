import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { EstadoCuentaService } from '../services/estado-cuenta.service';

@Controller('credito/estado-cuenta')
export class EstadoCuentaController {
  constructor(private readonly estadoCuenta: EstadoCuentaService) {}

  @Get(':clienteId')
  obtener(
    @Param('clienteId') clienteId: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.estadoCuenta.obtenerEstadoCuenta(
      clienteId,
      empresaId,
      fechaDesde,
      fechaHasta,
    );
  }
}
