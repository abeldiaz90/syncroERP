import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { CrearCuentaContableDto } from '../dto/crear-cuenta-contable.dto';
import { ActualizarCuentaContableDto } from '../dto/actualizar-cuenta-contable.dto';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { CuentasContablesService } from '../services/cuentas-contables.service';

@Controller('finanzas/cuentas-contables')
export class CuentasContablesController {
  constructor(private readonly cuentasService: CuentasContablesService) {}

  @Post()
  crear(
    @Body() dto: CrearCuentaContableDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.cuentasService.crearCuenta(dto, empresaId, usuarioId);
  }

  @Get()
  obtenerTodas(
    @ActiveUser('empresaId') empresaId: string,
    @Query('soloAfectables') soloAfectables?: string,
  ) {
    return this.cuentasService.obtenerCuentas(
      empresaId,
      soloAfectables === 'true',
    );
  }

  @Patch(':id')
  editar(
    @Param('id') id: string,
    @Body() dto: ActualizarCuentaContableDto,
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('sub') usuarioId: string,
  ) {
    return this.cuentasService.editarCuenta(id, dto, empresaId, usuarioId);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id') id: string,
    @ActiveUser('empresaId') empresaId: string,
  ) {
    return this.cuentasService.cambiarEstado(id, empresaId);
  }

  @Post('precargar-estandar')
  precargarEstandar(@ActiveUser('empresaId') empresaId: string) {
    return this.cuentasService.precargarPlanEstandar(empresaId);
  }
}
