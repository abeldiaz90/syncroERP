import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Venta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';

import { VentasController } from '../controllers/ventas.controller';
import { VentasService } from '../services/ventas.service';
import { DashboardEjecutivoController } from '../controllers/dashboard-ejecutivo.controller';
import { DashboardEjecutivoService } from '../services/dashboard-ejecutivo.service';

import { CatalogoModule } from '../../catalogo/catalogo.module';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';
import { NotificacionesModule } from '../../notificaciones/notificaciones.module';
import { AnulacionVentasService } from '../services/anulacion-ventas.service';
import { CreditoModule } from '../../credito/modules/credito.module';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';
import { CfdiModule } from '../../cfdi/cfdi.module';
import { DevolucionVenta } from '../entities/devolucion-venta.entity';
import { DetalleDevolucionVenta } from '../entities/detalle-devolucion-venta.entity';
import { AplicacionLoteDevolucion } from '../entities/aplicacion-lote-devolucion.entity';
import { SaldoFavorClienteMovimiento } from '../entities/saldo-favor-cliente.entity';
import { DevolucionesVentasService } from '../services/devoluciones-ventas.service';
import { SaldosFavorService } from '../services/saldos-favor.service';
import { CajaModule } from '../../caja/modules/caja.module';
// Para avisar al registro externo cuando una venta a crédito se anula o se
// devuelve. Sin esto el ERP cancelaba el crédito en su base y allá el préstamo
// seguía vivo por el importe completo.
import { IntegracionModule } from '../../integracion/modules/integracion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta,
      DetalleVenta,
      Cliente,
      Almacen,
      StockPorAlmacen,
      DevolucionVenta,
      DetalleDevolucionVenta,
      AplicacionLoteDevolucion,
      SaldoFavorClienteMovimiento,
    ]),
    CatalogoModule,
    FinanzasModule,
    CreditoModule,
    TesoreriaModule,
    CajaModule,
    CfdiModule,
    NotificacionesModule,
    IntegracionModule,
  ],
  controllers: [VentasController, DashboardEjecutivoController],
  providers: [
    VentasService,
    DashboardEjecutivoService,
    AnulacionVentasService,
    DevolucionesVentasService,
    SaldosFavorService,
  ],
})
export class VentasModule {}
