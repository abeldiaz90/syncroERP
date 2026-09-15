import { Controller, Get, Post } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Roles } from '../../iam/decorators/roles.decorator';
import { ContabilidadConciliacionService } from '../services/contabilidad-conciliacion.service';

@Controller('integracion/contabilidad/conciliacion')
@Roles('administrador', 'direccion')
export class ContabilidadConciliacionController {
  constructor(private readonly conciliacion: ContabilidadConciliacionService) {}
  @Get()
  consultar(@ActiveUser('empresaId') empresaId: string) {
    return this.conciliacion.conciliarEmpresa(empresaId);
  }
  @Post('ejecutar')
  ejecutar(@ActiveUser('empresaId') empresaId: string) {
    return this.conciliacion.conciliarEmpresa(empresaId, true);
  }
}
