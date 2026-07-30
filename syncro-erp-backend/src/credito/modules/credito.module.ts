import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CuentaBancaria } from '../entities/cuenta-bancaria.entity';
import { CreditoCliente } from '../entities/credito-cliente.entity';
import { AmortizacionCuota } from '../entities/amortizacion-cuota.entity';
import { PagoCobranza } from '../entities/pago-cobranza.entity';

import { CreditosController } from '../controllers/creditos.controller';
import { CobranzaController } from '../controllers/cobranza.controller';
import { CuentasBancariasController } from '../controllers/cuentas-bancarias.controller';

import { CreditosService } from '../services/creditos.service';
import { CobranzaService } from '../services/cobranza.service';
import { CuentasBancariasService } from '../services/cuentas-bancarias.service';
import { CobranzaCronService } from '../services/cobranza-cron.service';

import { FinanzasModule } from '../../finanzas/modules/finanzas.module';
import { NotificacionesModule } from '../../notificaciones/notificaciones.module'; // ← NUEVO
import { Banco } from '../../catalogo/entities/banco.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CuentaBancaria,
      CreditoCliente,
      AmortizacionCuota,
      PagoCobranza,
      Banco,
      CuentaContable,
    ]),
    FinanzasModule,
    TesoreriaModule,
    NotificacionesModule, // ← NUEVO
  ],
  controllers: [
    CreditosController,
    CobranzaController,
    CuentasBancariasController,
  ],
  providers: [
    CreditosService,
    CobranzaService,
    CuentasBancariasService,
    CobranzaCronService,
  ],
  exports: [CreditosService, CobranzaService, CuentasBancariasService],
})
export class CreditoModule {}
