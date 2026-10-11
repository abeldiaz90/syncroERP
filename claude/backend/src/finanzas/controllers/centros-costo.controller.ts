import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import {
  ActualizarCentroCostoDto,
  CrearCentroCostoDto,
} from '../dto/centro-costo.dto';
import { CentrosCostoService } from '../services/centros-costo.service';

@Controller('finanzas/centros-costo')
export class CentrosCostoController {
  constructor(private readonly servicio: CentrosCostoService) {}

  @Get()
  listar(
    @ActiveUser('empresaId') empresaId: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.servicio.listar(empresaId, incluirInactivos === 'true');
  }

  /**
   * Para que la pantalla de captura sepa si tiene que pedir el centro.
   *
   * La alternativa —que el front deduzca «si la lista viene vacía no se
   * exige»— pone la regla en dos sitios y el segundo se queda viejo. Es el
   * mismo motivo por el que la pantalla de usuarios pregunta en qué directorio
   * se va a crear la identidad en vez de suponerlo.
   */
  @Get('exigencia')
  async exigencia(@ActiveUser('empresaId') empresaId: string) {
    return { exigeEnCuentasDeResultado: await this.servicio.exigeCentro(empresaId) };
  }

  @Get(':id')
  obtener(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.servicio.obtener(id, empresaId);
  }

  @Post()
  crear(
    @Body() dto: CrearCentroCostoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.crear(empresaId, dto);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarCentroCostoDto,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.servicio.actualizar(id, empresaId, dto);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.servicio.eliminar(id, empresaId);
  }
}
