import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Requisicion } from '../entities/requisicion.entity';
import { DetalleRequisicion } from '../entities/detalle-requisicion.entity';
import { Aprobacion } from '../entities/aprobacion.entity';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { Cotizacion } from '../entities/cotizacion.entity';
import { DetalleCotizacion } from '../entities/detalle-cotizacion.entity';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { PagoProveedor } from '../entities/pago-proveedor.entity';
import { RecepcionCompra } from '../entities/recepcion-compra.entity';

import { RequisicionesController } from '../controllers/requisiciones.controller';
import { RequisicionesService } from '../services/requisiciones.service';
import { ConfiguracionesAprobacionController } from '../controllers/configuraciones-aprobacion.controller';
import { ConfiguracionesAprobacionService } from '../services/configuraciones-aprobacion.service';
import { CotizacionesController } from '../controllers/cotizaciones.controller';
import { CotizacionesService } from '../services/cotizaciones.service';
import { OrdenesCompraController } from '../controllers/ordenes-compra.controller';
import { OrdenesCompraService } from '../services/ordenes-compra.service';

import { CommonModule } from '../../common/modules/common.module';
import { CatalogoModule } from '../../catalogo/catalogo.module';
import { NotificacionesModule } from '../../notificaciones/notificaciones.module'; // ← NUEVO

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Requisicion,
      DetalleRequisicion,
      Aprobacion,
      Usuario,
      ConfiguracionAprobacion,
      Cotizacion,
      DetalleCotizacion,
      OrdenCompra,
      DetalleOrdenCompra,
      Proveedor,
      PagoProveedor,
      RecepcionCompra,
    ]),
    CommonModule,
    CatalogoModule,
    NotificacionesModule, // ← NUEVO
  ],
  controllers: [
    RequisicionesController,
    ConfiguracionesAprobacionController,
    CotizacionesController,
    OrdenesCompraController,
  ],
  providers: [
    RequisicionesService,
    ConfiguracionesAprobacionService,
    CotizacionesService,
    OrdenesCompraService,
  ],
})
export class ComprasModule {}
