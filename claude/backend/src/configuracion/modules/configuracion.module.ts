import { Module } from '@nestjs/common';

import { IamModule } from '../../iam/iam.module';
import { ConfiguracionController } from '../controllers/configuracion.controller';
import { DiagnosticoConfiguracionService } from '../services/diagnostico-configuracion.service';
import { OperacionesPendientesService } from '../services/operaciones-pendientes.service';
import { VerificadorEsquemaService } from '../services/verificador-esquema.service';

@Module({
  imports: [IamModule],
  controllers: [ConfiguracionController],
  providers: [DiagnosticoConfiguracionService, OperacionesPendientesService, VerificadorEsquemaService],
  exports: [DiagnosticoConfiguracionService, OperacionesPendientesService, VerificadorEsquemaService],
})
export class ConfiguracionModule {}
