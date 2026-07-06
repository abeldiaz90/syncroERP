import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Venta }          from '../entities/venta.entity';
import { DetalleVenta }   from '../entities/detalle-venta.entity';
import { Cliente }        from '../../clientes/entities/cliente.entity';
import { Almacen }        from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';

import { VentasController }             from '../controllers/ventas.controller';
import { VentasService }                from '../services/ventas.service';
import { DashboardEjecutivoController } from '../controllers/dashboard-ejecutivo.controller';
import { DashboardEjecutivoService }    from '../services/dashboard-ejecutivo.service';

import { CatalogoModule }       from '../../catalogo/catalogo.module';
import { FinanzasModule }       from '../../finanzas/modules/finanzas.module';
import { NotificacionesModule } from '../../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta, DetalleVenta, Cliente, Almacen, StockPorAlmacen,
    ]),
    CatalogoModule,
    FinanzasModule,
    NotificacionesModule,
  ],
  controllers: [VentasController, DashboardEjecutivoController],
  providers:   [VentasService, DashboardEjecutivoService],
})
export class VentasModule {}