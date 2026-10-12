import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { CierreAnualService } from '../services/cierre-anual.service';

@ApiTags('Finanzas')
@ApiBearerAuth('jwt')
@Controller('finanzas/cierre-anual')
export class CierreAnualController {
  constructor(private readonly svc: CierreAnualService) {}

  @Navegable('/dashboard/finanzas/cierre-anual', 'Cierre del ejercicio', 29)
  @Get(':ejercicio')
  @ApiOperation({
    summary: 'Qué falta para cerrar el año y cuánto resultado se traspasaría',
  })
  diagnosticar(
    @Param('ejercicio') ejercicio: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.svc.diagnosticar(empresaId, Number(ejercicio));
  }

  @Post(':ejercicio/traspasar')
  @ApiOperation({
    summary:
      'Asienta la póliza que deja en cero ingresos, costos y gastos y manda el resultado al capital',
  })
  /*
   * Sin cuerpo. Lo que hay que traspasar lo decide el servidor leyendo los
   * saldos del ejercicio: un cuerpo aquí sólo podría servir para que alguien
   * mandara otras cifras, y las cifras del cierre no se teclean.
   */
  traspasar(
    @Param('ejercicio') ejercicio: string,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id') usuarioId: string,
  ) {
    return this.svc.traspasarResultado(empresaId, Number(ejercicio), usuarioId);
  }
}
