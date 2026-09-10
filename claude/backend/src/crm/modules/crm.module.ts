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

@Module({
  imports: [
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
