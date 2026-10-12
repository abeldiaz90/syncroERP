import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Venta } from '../entities/venta.entity';
import { DetalleVenta } from '../entities/detalle-venta.entity';
import {
  DetallePedidoVenta,
  PedidoVenta,
} from '../entities/pedido-venta.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';

import { VentasController } from '../controllers/ventas.controller';
import { VentasService } from '../services/ventas.service';
import { PedidosVentaController } from '../controllers/pedidos-venta.controller';
import { PedidosVentaService } from '../services/pedidos-venta.service';
import { CommonModule } from '../../common/modules/common.module';
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
// El ticket sale por una impresora térmica de red; ver `impresion/`.
import { Empresa } from '../../iam/entities/empresa.entity';
import { ImpresoraCaja } from '../../caja/entities/impresora-caja.entity';
import { ImpresionTicketsController } from '../controllers/impresion-tickets.controller';
import { ImpresionTicketsService } from '../impresion/impresion-tickets.service';
import { ImpresoraTermicaService } from '../impresion/impresora-termica.service';

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
      Empresa,
      ImpresoraCaja,
      PedidoVenta,
      DetallePedidoVenta,
    ]),
    CatalogoModule,
    FinanzasModule,
    CreditoModule,
    TesoreriaModule,
    CajaModule,
    CfdiModule,
    NotificacionesModule,
    IntegracionModule,
    /* Por `FoliosService`: el pedido lleva folio PV-2026-000001, que es lo que
       el cliente dice por teléfono. */
    CommonModule,
  ],
  controllers: [
    /*
     * ────────────────────────────────────────────────────────────────────────
     * EL ORDEN DE ESTA LISTA ES PARTE DEL CONTRATO
     * ------------------------------------------------------------------------
     * `VentasController` es `@Controller('ventas')` y tiene un `@Get(':id')`.
     * Nest resuelve las rutas por orden de registro, así que con el de pedidos
     * declarado DESPUÉS, `GET /ventas/pedidos` casaba con `GET /ventas/:id`
     * tomando «pedidos» por un uuid, y contestaba 400.
     *
     * La pantalla no se caía: cargaba entera y con sus desplegables VACÍOS,
     * porque el 400 tumbaba el `Promise.all` que también traía clientes,
     * almacenes y productos. Se veía una pantalla completa en la que no se
     * podía capturar nada. Lo encontró el primer clic en el navegador, no las
     * 2,647 pruebas.
     *
     * Es el mismo defecto que ya documentó `almacenes.controller.ts` con
     * «para-venta», y por eso ahora lo vigila
     * `una-ruta-literal-no-se-esconde-tras-un-parametro.spec.ts`.
     * ────────────────────────────────────────────────────────────────────────
     */
    PedidosVentaController,
    VentasController,
    DashboardEjecutivoController,
    ImpresionTicketsController,
  ],
  providers: [
    VentasService,
    DashboardEjecutivoService,
    AnulacionVentasService,
    DevolucionesVentasService,
    SaldosFavorService,
    ImpresionTicketsService,
    ImpresoraTermicaService,
    PedidosVentaService,
  ],
})
export class VentasModule {}
