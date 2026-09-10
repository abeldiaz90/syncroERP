import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { Navegable } from '../../iam/decorators/navegable.decorator';
import { IntegridadFinancieraService } from '../services/integridad-financiera.service';

@ApiTags('Finanzas')
@ApiBearerAuth('jwt')
@Controller('finanzas/integridad')
export class IntegridadFinancieraController {
  constructor(private readonly servicio: IntegridadFinancieraService) {}

  @Get('diagnostico')
  @Navegable(
    '/dashboard/finanzas/integridad',
    'Integridad financiera',
    92,
  )
  @ApiOperation({ summary: 'Diagnóstico transversal de sincronización financiera' })
  diagnosticar(@ActiveUser('empresaId') empresaId: string) {
    return this.servicio.diagnosticar(empresaId);
  }
}
