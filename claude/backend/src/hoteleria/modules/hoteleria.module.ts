import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from '../entities/hotel.entity';
import { TipoHabitacion } from '../entities/tipo-habitacion.entity';
import { Habitacion } from '../entities/habitacion.entity';
import { DotacionTipoHabitacion } from '../entities/dotacion-tipo-habitacion.entity';
import { Reservacion } from '../entities/reservacion.entity';
import { CargoFolio, Folio, PagoFolioHotel } from '../entities/folio.entity';
import { TareaHousekeeping } from '../entities/tarea-housekeeping.entity';
import { ConfiguracionHotelService } from '../services/configuracion-hotel.service';
import { OperacionHotelService } from '../services/operacion-hotel.service';
import { HousekeepingService } from '../services/housekeeping.service';
import { AuditoriaNocturnaService } from '../services/auditoria-nocturna.service';
import { DisponibilidadService } from '../services/disponibilidad.service';
import { ConfiguracionHotelController } from '../controllers/configuracion-hotel.controller';
import { OperacionHotelController } from '../controllers/operacion-hotel.controller';
import { HousekeepingController } from '../controllers/housekeeping.controller';
import { AuditoriaNocturnaController } from '../controllers/auditoria-nocturna.controller';
import { DisponibilidadController } from '../controllers/disponibilidad.controller';
import { CityLedgerController } from '../controllers/city-ledger.controller';
import {
  CobroCityLedger,
  ConvenioCreditoHotel,
  CuentaCobrarHotel,
} from '../entities/city-ledger.entity';
import { CityLedgerService } from '../services/city-ledger.service';
import { CatalogoModule } from '../../catalogo/catalogo.module';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';
import { RecetasModule } from '../../recetas/modules/recetas.module';
import { AprobacionesModule } from '../../aprobaciones/modules/aprobaciones.module';
import { CajaModule } from '../../caja/modules/caja.module';
import { CommonModule } from '../../common/modules/common.module';

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
      PagoFolioHotel,
      TareaHousekeeping,
      ConvenioCreditoHotel,
      CuentaCobrarHotel,
      CobroCityLedger,
    ]),
    CatalogoModule,
    FinanzasModule,
    TesoreriaModule,
    RecetasModule,
    AprobacionesModule,
    CajaModule,
    CommonModule,
  ],
  controllers: [
    ConfiguracionHotelController,
    OperacionHotelController,
    HousekeepingController,
    AuditoriaNocturnaController,
    DisponibilidadController,
    CityLedgerController,
  ],
  providers: [
    ConfiguracionHotelService,
    OperacionHotelService,
    HousekeepingService,
    AuditoriaNocturnaService,
    DisponibilidadService,
    CityLedgerService,
  ],
  exports: [
    ConfiguracionHotelService,
    OperacionHotelService,
    HousekeepingService,
    DisponibilidadService,
    CityLedgerService,
  ],
})
export class HoteleriaModule {}
