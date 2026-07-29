import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ConsumoRecetasService } from '../services/consumo-recetas.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@ApiTags('Recetas')
@ApiBearerAuth('jwt')
@Controller('recetas/costos')
export class ConsumoRecetasController {
  constructor(private readonly svc: ConsumoRecetasService) {}

  @Get('teorico-vs-real')
  @ApiOperation({
    summary: 'Compara el consumo esperado contra el real del periodo',
    description:
      'La diferencia es merma no registrada, porciones mal servidas o robo. ' +
      'En alimentos y bebidas suele ser el margen completo del negocio.',
  })
  teoricoVsReal(
    @ActiveUser('empresaId') empresaId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.svc.teoricoContraReal(empresaId, desde, hasta, almacenId);
  }

  @Get(':recetaId/actual')
  @ApiOperation({
    summary: 'Costo de la receta con los precios de hoy',
    description:
      'El campo costoTeorico se calcula al guardar la receta y se queda viejo. ' +
      'Esto consulta el costo actual del inventario.',
  })
  costoActual(
    @Param('recetaId') recetaId: string,
    @ActiveUser('empresaId') empresaId: string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.svc.costoActual(recetaId, empresaId, almacenId);
  }

  @Post('recalcular')
  @ApiOperation({ summary: 'Actualiza el costo guardado de todas las recetas' })
  recalcular(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.recalcularTodas(empresaId);
  }
}
