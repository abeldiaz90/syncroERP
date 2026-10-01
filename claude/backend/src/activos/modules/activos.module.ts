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
