import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import { CuentasBancariasService } from '../services/cuentas-bancarias.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../../iam/decorators/skip-permisos.decorator';

@SkipPermisos()
@Controller('credito/cuentas-bancarias')
export class CuentasBancariasController {
  constructor(private readonly svc: CuentasBancariasService) {}

  @Post()
  crear(@Body() body: any, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.crear(body, empresaId);
  }

  @Get()
  obtenerTodas(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerTodas(empresaId);
  }

  @Get(':id')
  obtenerUna(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerPorId(id, empresaId);
  }

  @Patch(':id')
  editar(@Param('id') id: string, @Body() body: any, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.editar(id, body, empresaId);
  }

  @Patch(':id/estado')
  toggleEstado(@Param('id') id: string, @ActiveUser('empresaId') empresaId: string) {
    return this.svc.toggleEstado(id, empresaId);
  }
}