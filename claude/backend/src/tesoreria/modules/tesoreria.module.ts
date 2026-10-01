import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  EstadoCuentaBancario,
  LineaEstadoCuenta,
  MovimientoTesoreria,
} from '../entities/tesoreria.entity';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';
import { TesoreriaService } from '../services/tesoreria.service';
import { TesoreriaController } from '../controllers/tesoreria.controller';
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
    TypeOrmModule.forFeature([
      MovimientoTesoreria,
      EstadoCuentaBancario,
      LineaEstadoCuenta,
      CuentaBancaria,
    ]),
    forwardRef(() => FinanzasModule),
  ],
  controllers: [TesoreriaController],
  providers: [TesoreriaService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
