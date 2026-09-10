import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ActivoFijo,
  CategoriaActivo,
  DepreciacionMensual,
} from '../entities/activo-fijo.entity';
import { ActivosService } from '../services/activos.service';
import { ActivosController } from '../controllers/activos.controller';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';

@Module({
  imports: [
    FinanzasModule,
    TypeOrmModule.forFeature([
      ActivoFijo,
      CategoriaActivo,
      DepreciacionMensual,
    ]),
  ],
  controllers: [ActivosController],
  providers: [ActivosService],
  exports: [ActivosService],
})
export class ActivosModule {}
