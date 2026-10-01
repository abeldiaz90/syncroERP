import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Actividad,
  EtapaEmbudo,
  HistorialEtapa,
  Oportunidad,
  Prospecto,
} from '../entities/crm.entity';
import { CrmService } from '../services/crm.service';
import { CrmController } from '../controllers/crm.controller';
import { CommonModule } from '../../common/modules/common.module';

@Module({
  imports: [
    /*
     * `CommonModule` exporta `FoliosService`, que este módulo inyecta para
     * numerar sin carreras. Sin esta línea Nest no resuelve la dependencia y
     * LA API NO ARRANCA —«Nest can't resolve dependencies»— con un fallo que
     * `tsc` no ve, porque el tipo está bien: lo que falta es el proveedor en
     * el contexto. Es la misma clase de defecto que el `ordenMenu: 21.5`.
     */
    CommonModule,
    TypeOrmModule.forFeature([
      Oportunidad,
      Prospecto,
      EtapaEmbudo,
      Actividad,
      HistorialEtapa,
    ]),
  ],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
