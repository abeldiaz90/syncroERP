import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Asistencia,
  ConceptoNomina,
  Empleado,
  Incidencia,
  PartidaRecibo,
  PeriodoNomina,
  Puesto,
  ReciboNomina,
} from '../entities/rrhh.entity';
import { RrhhService } from '../services/rrhh.service';
import { RrhhController } from '../controllers/rrhh.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Empleado,
      Puesto,
      Asistencia,
      Incidencia,
      ConceptoNomina,
      PeriodoNomina,
      ReciboNomina,
      PartidaRecibo,
    ]),
  ],
  controllers: [RrhhController],
  providers: [RrhhService],
  exports: [RrhhService],
})
export class RrhhModule {}
