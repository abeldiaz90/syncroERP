import { Controller, Get } from '@nestjs/common';
import { DashboardEjecutivoService } from '../services/dashboard-ejecutivo.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('dashboard/ejecutivo')
export class DashboardEjecutivoController {
  constructor(private readonly svc: DashboardEjecutivoService) {}

  @Get()
  obtenerResumen(@ActiveUser('empresaId') empresaId: string) {
    return this.svc.obtenerResumen(empresaId);
  }
}
