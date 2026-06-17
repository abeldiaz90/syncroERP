// src/compras/compras.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requisicion } from '../entities/requisicion.entity';
import { DetalleRequisicion } from '../entities/detalle-requisicion.entity';
import { Aprobacion } from '../entities/aprobacion.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { RequisicionesController } from '../controllers/requisiciones.controller';
import { RequisicionesService } from '../services/requisiciones.service';
import { CommonModule } from '../../common/modules/common.module';
import { ConfiguracionAprobacion } from '../entities/configuracion-aprobacion.entity';
import { ConfiguracionesAprobacionController } from '../controllers/configuraciones-aprobacion.controller';
import { ConfiguracionesAprobacionService } from '../services/configuraciones-aprobacion.service';
import { Cotizacion } from '../entities/cotizacion.entity';
import { DetalleCotizacion } from '../entities/detalle-cotizacion.entity';
import { CotizacionesController } from '../controllers/cotizaciones.controller';
import { CotizacionesService } from '../services/cotizaciones.service';
import { OrdenCompra } from '../entities/orden-compra.entity';
import { DetalleOrdenCompra } from '../entities/detalle-orden-compra.entity';
import { OrdenesCompraController } from '../controllers/ordenes-compra.controller';
import { OrdenesCompraService } from '../services/ordenes-compra.service';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { InventarioService } from '../../catalogo/services/inventario.service';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { StockPorAlmacen } from '../../catalogo/entities/stock-por-almacen.entity';
import { StockService } from '../../catalogo/services/stock.service';
import { LoteInventario } from '../../catalogo/entities/lote-inventario.entity';
import { ProductoEquivalencia } from '../../catalogo/entities/producto-equivalencia.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      Requisicion, DetalleRequisicion, Aprobacion, Producto, Usuario,
      ConfiguracionAprobacion, Cotizacion, DetalleCotizacion,
      OrdenCompra, DetalleOrdenCompra, Proveedor,
      MovimientoInventario, StockPorAlmacen, LoteInventario, ProductoEquivalencia,
    ]),
    CommonModule,
  ],
  controllers: [
    RequisicionesController, ConfiguracionesAprobacionController,
    CotizacionesController, OrdenesCompraController,
  ],
  providers: [
    RequisicionesService, ConfiguracionesAprobacionService,
    CotizacionesService, OrdenesCompraService,
    InventarioService, StockService,
  ],
  exports: [
    InventarioService,
    StockService,
  ],
})
export class ComprasModule {}