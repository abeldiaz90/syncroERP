import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { MapearCuentaSatDto } from '../dto/mapear-cuenta-sat.dto';
import { TipoCatalogoSat } from '../entities/catalogo-sat-entrada.entity';
import { CatalogosSatService } from '../services/catalogos-sat.service';

@Controller('finanzas/catalogos-sat')
export class CatalogosSatController {
  constructor(private readonly catalogos: CatalogosSatService) {}

  @Get('resumen')
  resumen() {
    return this.catalogos.resumen();
  }

  @Get('diagnostico-mapeo')
  diagnostico(@ActiveUser('empresaId') empresaId: string) {
    return this.catalogos.diagnosticoMapeo(empresaId);
  }

  @Get('diagnostico-iva/historico')
  diagnosticoIva(@ActiveUser('empresaId') empresaId: string) {
    return this.catalogos.diagnosticoHistoricoIva(empresaId);
  }

  @Get(':tipo')
  listar(
    @Param('tipo') tipo: TipoCatalogoSat,
    @Query('buscar') buscar?: string,
    @Query('pagina') pagina?: string,
    @Query('limite') limite?: string,
  ) {
    return this.catalogos.listar(
      String(tipo).toUpperCase() as TipoCatalogoSat,
      buscar,
      Number(pagina ?? 1),
      Number(limite ?? 50),
    );
  }

  @Post('cuentas/:cuentaId/mapear')
  mapear(
    @Param('cuentaId', ParseUUIDPipe) cuentaId: string,
    @Body() dto: MapearCuentaSatDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.catalogos.mapearCuenta(cuentaId, empresaId, dto, usuarioId);
  }
}
