import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PUERTO_CARTERA_EXTERNA,
  PUERTO_CONTABILIDAD_EXTERNA,
  PUERTO_USUARIOS_EXTERNOS,
} from '../../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../../entities/configuracion-integracion-empresa.entity';
import { VinculoIntegracion } from '../../entities/vinculo-integracion.entity';
import { FineractCarteraAdapter } from './fineract-cartera.adapter';
import { FineractContabilidadAdapter } from './fineract-contabilidad.adapter';
import { FineractUsuariosAdapter } from './fineract-usuarios.adapter';
import { FineractAuthService } from './fineract-auth.service';
import { FineractConfig } from './fineract.config';
import { FineractHttpService } from './fineract-http.service';
import { ContextoInquilinoService } from '../../services/contexto-inquilino.service';

/**
 * Adaptador de Apache Fineract.
 *
 * Todo lo que sabe de Fineract está aquí dentro. El resto del ERP sólo ve
 * `PUERTO_CARTERA_EXTERNA` y `PUERTO_CONTABILIDAD_EXTERNA`. Cambiar de
 * proveedor es escribir otro módulo como éste y sustituirlo en
 * `integracion.module.ts`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConfiguracionIntegracionEmpresa,
      VinculoIntegracion,
    ]),
  ],
  providers: [
    ContextoInquilinoService,
    FineractConfig,
    FineractAuthService,
    FineractHttpService,
    { provide: PUERTO_CARTERA_EXTERNA, useClass: FineractCarteraAdapter },
    {
      provide: PUERTO_CONTABILIDAD_EXTERNA,
      useClass: FineractContabilidadAdapter,
    },
    { provide: PUERTO_USUARIOS_EXTERNOS, useClass: FineractUsuariosAdapter },
  ],
  exports: [
    ContextoInquilinoService,
    PUERTO_CARTERA_EXTERNA,
    PUERTO_CONTABILIDAD_EXTERNA,
    PUERTO_USUARIOS_EXTERNOS,
  ],
})
export class FineractAdapterModule {}
