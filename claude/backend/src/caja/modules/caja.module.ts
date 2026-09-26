import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';
import { CajaController } from '../controllers/caja.controller';
import { MovimientoCaja } from '../entities/movimiento-caja.entity';
import { TurnoCaja } from '../entities/turno-caja.entity';
import { CajaService } from '../services/caja.service';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CuentaBancaria, TurnoCaja, MovimientoCaja]),
    forwardRef(() => TesoreriaModule),
    // Por el servicio de asientos pendientes: el arqueo con diferencia encola
    // su póliza como cualquier otra operación del sistema.
    forwardRef(() => FinanzasModule),
  ],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
