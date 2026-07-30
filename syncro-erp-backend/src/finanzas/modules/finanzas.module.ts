import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { Poliza } from '../entities/poliza.entity';
import { PartidaPoliza } from '../entities/partida-poliza.entity';
import { CuentasContablesController } from '../controllers/cuentas-contables.controller';
import { PolizasController } from '../controllers/polizas.controller';
import { CuentasContablesService } from '../services/cuentas-contables.service';
import { PolizasService } from '../services/polizas.service';
import { MotorContableService } from '../services/motor-contable.service';
import { Producto } from '../../catalogo/entities/producto.entity';
import { AsientoPendiente } from '../entities/asiento-pendiente.entity';
import { AsientosPendientesController } from '../controllers/asientos-pendientes.controller';
import { AsientosPendientesService } from '../services/asientos-pendientes.service';
import { ActivacionFinanciera } from '../entities/activacion-financiera.entity';
import { Empresa } from '../../iam/entities/empresa.entity';
import { ConfiguracionFiscal } from '../../cfdi/configuracion-fiscal.entity';
import { Impuesto } from '../../catalogo/entities/impuesto.entity';
import { ActivacionFinancieraController } from '../controllers/activacion-financiera.controller';
import { ActivacionFinancieraService } from '../services/activacion-financiera.service';
import { ConciliacionFinanciera } from '../entities/conciliacion-financiera.entity';
import { ConciliacionFinancieraController } from '../controllers/conciliacion-financiera.controller';
import { ConciliacionFinancieraService } from '../services/conciliacion-financiera.service';
import { CierreContable } from '../entities/cierre-contable.entity';
import { RevisionCierreMensual } from '../entities/revision-cierre-mensual.entity';
import { EventoCierreContable } from '../entities/evento-cierre-contable.entity';
import { CierreContableController } from '../controllers/cierre-contable.controller';
import { CierreContableService } from '../services/cierre-contable.service';
import { CatalogoFiscalVersion } from '../entities/catalogo-fiscal-version.entity';
import { CatalogoSatEntrada } from '../entities/catalogo-sat-entrada.entity';
import { CuentaContableSatMapeo } from '../entities/cuenta-contable-sat-mapeo.entity';
import { CatalogosSatController } from '../controllers/catalogos-sat.controller';
import { CatalogosSatService } from '../services/catalogos-sat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CuentaContable,
      Poliza,
      PartidaPoliza,
      Producto,
      AsientoPendiente,
      ActivacionFinanciera,
      Empresa,
      ConfiguracionFiscal,
      Impuesto,
      ConciliacionFinanciera,
      CierreContable,
      RevisionCierreMensual,
      EventoCierreContable,
      CatalogoFiscalVersion,
      CatalogoSatEntrada,
      CuentaContableSatMapeo,
    ]),
  ],
  controllers: [
    CuentasContablesController,
    PolizasController,
    AsientosPendientesController,
    ActivacionFinancieraController,
    ConciliacionFinancieraController,
    CierreContableController,
    CatalogosSatController,
  ],
  providers: [
    CuentasContablesService,
    PolizasService,
    MotorContableService,
    AsientosPendientesService,
    ActivacionFinancieraService,
    ConciliacionFinancieraService,
    CierreContableService,
    CatalogosSatService,
  ],
  exports: [
    MotorContableService,
    CuentasContablesService,
    PolizasService,
    AsientosPendientesService,
    ActivacionFinancieraService,
    ConciliacionFinancieraService,
    CierreContableService,
    CatalogosSatService,
  ],
})
export class FinanzasModule {}
