import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { RegistroAuditoria } from '../entities/registro-auditoria.entity';
import { AuditoriaService } from '../services/auditoria.service';
import { AuditoriaController } from '../controllers/auditoria.controller';
import { AuditoriaInterceptor } from '../interceptors/auditoria.interceptor';

/**
 * Módulo de auditoría.
 *
 * @Global para que AuditoriaService pueda inyectarse en cualquier módulo
 * (por ejemplo, para auditar acciones específicas a mano) sin re-importar.
 *
 * Registra el interceptor de forma GLOBAL vía APP_INTERCEPTOR: con solo
 * importar este módulo en AppModule, toda escritura sensible queda auditada.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RegistroAuditoria])],
  controllers: [AuditoriaController],
  providers: [
    AuditoriaService,
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
