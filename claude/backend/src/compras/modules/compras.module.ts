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
import { Endpoint } from '../../iam/entities/endpoint.entity';
import { RolEndpointPermiso } from '../../iam/entities/rol-endpoint-permiso.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { PagoProveedor } from '../entities/pago-proveedor.entity';
import { RecepcionCompra } from '../entities/recepcion-compra.entity';
import { RecepcionCompraDetalle } from '../entities/recepcion-compra-detalle.entity';
import { AprobacionDocumento } from '../entities/aprobacion-documento.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

import { RequisicionesController } from '../controllers/requisiciones.controller';
import { RutasAprobacionInicialesService } from '../services/rutas-aprobacion-iniciales.service';
import { RequisicionesService } from '../services/requisiciones.service';
import { ConfiguracionesAprobacionController } from '../controllers/configuraciones-aprobacion.controller';
import { ConfiguracionesAprobacionService } from '../services/configuraciones-aprobacion.service';
import { CotizacionesController } from '../controllers/cotizaciones.controller';
import { CotizacionesService } from '../services/cotizaciones.service';
import { OrdenesCompraController } from '../controllers/ordenes-compra.controller';
import { OrdenesCompraService } from '../services/ordenes-compra.service';

import { CommonModule } from '../../common/modules/common.module';
import { CatalogoModule } from '../../catalogo/catalogo.module';
import { NotificacionesModule } from '../../notificaciones/notificaciones.module';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';
import { CajaModule } from '../../caja/modules/caja.module';
import { IamModule } from '../../iam/iam.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Requisicion,
      DetalleRequisicion,
      Aprobacion,
      Usuario,
      Endpoint,
      RolEndpointPermiso,
      ConfiguracionAprobacion,
      Cotizacion,
      DetalleCotizacion,
      OrdenCompra,
      DetalleOrdenCompra,
      Proveedor,
      PagoProveedor,
      RecepcionCompra,
      RecepcionCompraDetalle,
      AprobacionDocumento,
      Departamento,
      Producto,
    ]),
    CommonModule,
    CatalogoModule,
    NotificacionesModule,
    TesoreriaModule,
    CajaModule,
    IamModule,
  ],
  controllers: [
    RequisicionesController,
    ConfiguracionesAprobacionController,
    CotizacionesController,
    OrdenesCompraController,
  ],
  providers: [
    RequisicionesService,
    /*
     * Garantiza que toda área nazca con ruta de aprobación de requisiciones.
     * Sin ella, abrir un área no alcanzaba para trabajar y el usuario lo
     * descubría al guardar, con el formulario ya lleno.
     */
    RutasAprobacionInicialesService,
    ConfiguracionesAprobacionService,
    CotizacionesService,
    OrdenesCompraService,
  ],
})
export class ComprasModule {}
