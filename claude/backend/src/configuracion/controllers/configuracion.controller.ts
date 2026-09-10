import { Controller, Get } from '@nestjs/common';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';
import { DiagnosticoConfiguracionService } from '../services/diagnostico-configuracion.service';
import { OperacionesPendientesService } from '../services/operaciones-pendientes.service';
import { VerificadorEsquemaService } from '../services/verificador-esquema.service';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(
    private readonly diagnostico: DiagnosticoConfiguracionService,
    private readonly pendientes: OperacionesPendientesService,
    private readonly esquema: VerificadorEsquemaService,
  ) {}

  @Get('integridad')
  integridad(@ActiveUser('empresaId') empresaId: string) {
    return this.diagnostico.verificarIntegridad(empresaId);
  }

  @Get('esquema')
  verificarEsquema() {
    return this.esquema.verificar();
  }

  @Get('pendientes')
  obtenerPendientes(@ActiveUser('empresaId') empresaId: string) {
    return this.pendientes.obtener(empresaId);
  }

  @Get('empresa')
  empresa(@ActiveUser('empresaId') empresaId: string) {
    return this.diagnostico.obtenerEmpresa(empresaId);
  }

  @Get('diagnostico')
  obtener(@ActiveUser('empresaId') empresaId: string) {
    return this.diagnostico.obtener(empresaId);
  }
}
