import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CuentaBancaria } from '../entities/cuenta-bancaria.entity';
import { CreditoCliente } from '../entities/credito-cliente.entity';
import { AmortizacionCuota } from '../entities/amortizacion-cuota.entity';
import { PagoCobranza } from '../entities/pago-cobranza.entity';
import { PoliticaVencimientoEmpresa } from '../entities/politica-vencimiento-empresa.entity';
import { ProductoCredito } from '../entities/producto-credito.entity';

import { CreditosController } from '../controllers/creditos.controller';
import { CobranzaController } from '../controllers/cobranza.controller';
import { CuentasBancariasController } from '../controllers/cuentas-bancarias.controller';
import { ProductosCreditoController } from '../controllers/productos-credito.controller';

import { CreditosService } from '../services/creditos.service';
import { ProductosCreditoService } from '../services/productos-credito.service';
import { ProductosCreditoSyncService } from '../services/productos-credito-sync.service';
import { PoliticaVencimientoService } from '../services/politica-vencimiento.service';
import { CobranzaService } from '../services/cobranza.service';
import { CuentasBancariasService } from '../services/cuentas-bancarias.service';
import { CobranzaCronService } from '../services/cobranza-cron.service';
import { EstadoCuentaService } from '../services/estado-cuenta.service';
import { EstadoCuentaController } from '../controllers/estado-cuenta.controller';

import { FinanzasModule } from '../../finanzas/modules/finanzas.module';
import { NotificacionesModule } from '../../notificaciones/notificaciones.module'; // ← NUEVO
import { Banco } from '../../catalogo/entities/banco.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';
import { CfdiModule } from '../../cfdi/cfdi.module';
import { CajaModule } from '../../caja/modules/caja.module';
import { CommonModule } from '../../common/modules/common.module';
import { IntegracionModule } from '../../integracion/modules/integracion.module';

@Module({
  imports: [
    IntegracionModule,
    TypeOrmModule.forFeature([
      CuentaBancaria,
      CreditoCliente,
      AmortizacionCuota,
      PagoCobranza,
      PoliticaVencimientoEmpresa,
      ProductoCredito,
      Banco,
      CuentaContable,
    ]),
    FinanzasModule,
    TesoreriaModule,
    CajaModule,
    CommonModule,
    CfdiModule,
    NotificacionesModule, // ← NUEVO
  ],
  controllers: [
    CreditosController,
    CobranzaController,
    CuentasBancariasController,
    ProductosCreditoController,
    EstadoCuentaController,
  ],
  providers: [
    CreditosService,
    ProductosCreditoService,
    ProductosCreditoSyncService,
    PoliticaVencimientoService,
    CobranzaService,
    CuentasBancariasService,
    CobranzaCronService,
    EstadoCuentaService,
  ],
  exports: [
    CreditosService,
    CobranzaService,
    CuentasBancariasService,
    ProductosCreditoService,
    ProductosCreditoSyncService,
  ],
})
export class CreditoModule {}
