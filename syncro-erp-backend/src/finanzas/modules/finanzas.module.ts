import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { Poliza } from '../entities/poliza.entity';
import { PartidaPoliza } from '../entities/partida-poliza.entity';
import { CuentasContablesController } from '../controllers/cuentas-contables.controller';
import { PolizasController } from '../controllers/polizas.controller';
import { CuentasContablesService } from '../services/cuentas-contables.service';
import { PolizasService } from '../services/polizas.service';
import { MotorContableService } from '../services/motor-contable.service';
import { Producto } from '../../catalogo/entities/producto.entity';
import { AsientoPendiente } from '../entities/asiento-pendiente.entity';
import { AsientosPendientesController } from '../controllers/asientos-pendientes.controller';
import { AsientosPendientesService } from '../services/asientos-pendientes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CuentaContable, Poliza, PartidaPoliza, Producto, AsientoPendiente,
    ]),
  ],
  controllers: [
    CuentasContablesController, PolizasController, AsientosPendientesController,
  ],
  providers: [
    CuentasContablesService, PolizasService, MotorContableService,
    AsientosPendientesService,
  ],
  exports: [
    MotorContableService, CuentasContablesService, PolizasService,
    AsientosPendientesService,
  ],
})
export class FinanzasModule {}
