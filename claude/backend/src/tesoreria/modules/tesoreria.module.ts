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

@Module({
  imports: [
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
