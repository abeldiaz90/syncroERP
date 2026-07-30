import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Hotel } from '../entities/hotel.entity';
import { TipoHabitacion } from '../entities/tipo-habitacion.entity';
import { Habitacion } from '../entities/habitacion.entity';
import { DotacionTipoHabitacion } from '../entities/dotacion-tipo-habitacion.entity';
import { Reservacion } from '../entities/reservacion.entity';
import { Folio, CargoFolio } from '../entities/folio.entity';
import { TareaHousekeeping } from '../entities/tarea-housekeeping.entity';

import { ConfiguracionHotelService } from '../services/configuracion-hotel.service';
import { OperacionHotelService } from '../services/operacion-hotel.service';
import { HousekeepingService } from '../services/housekeeping.service';
import { AuditoriaNocturnaService } from '../services/auditoria-nocturna.service';

import { ConfiguracionHotelController } from '../controllers/configuracion-hotel.controller';
import { OperacionHotelController } from '../controllers/operacion-hotel.controller';
import { HousekeepingController } from '../controllers/housekeeping.controller';
import { AuditoriaNocturnaController } from '../controllers/auditoria-nocturna.controller';

// ⚠️ Ajusta las rutas a tus módulos reales
import { CatalogoModule } from '../../catalogo/catalogo.module';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Hotel,
      TipoHabitacion,
      Habitacion,
      DotacionTipoHabitacion,
      Reservacion,
      Folio,
      CargoFolio,
      TareaHousekeeping,
    ]),
    CatalogoModule, // InventarioService (descuento de insumos)
    FinanzasModule, // MotorContableService (póliza de hospedaje)
  ],
  controllers: [
    ConfiguracionHotelController,
    OperacionHotelController,
    HousekeepingController,
    AuditoriaNocturnaController, // ← NUEVO
  ],
  providers: [
    ConfiguracionHotelService,
    OperacionHotelService,
    HousekeepingService,
    AuditoriaNocturnaService, // ← NUEVO
  ],
  exports: [
    ConfiguracionHotelService,
    OperacionHotelService,
    HousekeepingService,
  ],
})
export class HoteleriaModule {}
