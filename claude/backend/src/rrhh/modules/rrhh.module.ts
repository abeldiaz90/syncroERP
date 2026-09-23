import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanzasModule } from '../../finanzas/modules/finanzas.module';
import { TesoreriaModule } from '../../tesoreria/modules/tesoreria.module';
import { CajaModule } from '../../caja/modules/caja.module';
import {
  Asistencia,
  ConceptoNomina,
  ContratoLaboral,
  Empleado,
  Incidencia,
  MovimientoLaboral,
  ParametroNomina,
  PartidaRecibo,
  PeriodoNomina,
  Puesto,
  ReciboNomina,
  SolicitudVacaciones,
  SaldoVacaciones,
  DiaCalendarioLaboral,
} from '../entities/rrhh.entity';
import { SolicitudEstructura } from '../entities/solicitud-estructura.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Banco } from '../../catalogo/entities/banco.entity';
import { ConfiguracionAprobacion } from '../../compras/entities/configuracion-aprobacion.entity';
import { AprobacionDocumento } from '../../compras/entities/aprobacion-documento.entity';
import { RrhhService } from '../services/rrhh.service';
import { NominaCalculoService } from '../services/nomina-calculo.service';
import { RrhhController } from '../controllers/rrhh.controller';
import { NominaAvanzadaController } from '../advanced/nomina-avanzada.controller';
import { NominaAvanzadaService } from '../advanced/nomina-avanzada.service';
import { EstructuraOrganizacionalController } from '../controllers/estructura-organizacional.controller';
import { EstructuraOrganizacionalService } from '../services/estructura-organizacional.service';
import {
  AplicacionObligacionNomina,
  AplicacionPagoNomina,
  AprobacionNomina,
  CfdiNomina,
  CierreNomina,
  ConceptoEmpleado,
  ConfiguracionPatronal,
  CuentaBancariaEmpleado,
  DispersionNomina,
  DispersionNominaDetalle,
  EventoNomina,
  MovimientoPrestamoNomina,
  ObligacionEmpleado,
  PagoNomina,
  PolizaNominaDetalle,
  PrestamoEmpleado,
} from '../advanced/nomina-avanzada.entity';
import { Usuario } from '../../iam/entities/usuario.entity';

@Module({
  imports: [
    FinanzasModule,
    TesoreriaModule,
    CajaModule,
    TypeOrmModule.forFeature([
      Empleado,
      Puesto,
      Asistencia,
      Incidencia,
      ConceptoNomina,
      PeriodoNomina,
      ReciboNomina,
      PartidaRecibo,
      ContratoLaboral,
      MovimientoLaboral,
      ParametroNomina,
      SolicitudVacaciones,
      SaldoVacaciones,
      DiaCalendarioLaboral,
      Departamento,
      SolicitudEstructura,
      ConfiguracionPatronal,
      ConceptoEmpleado,
      PrestamoEmpleado,
      AprobacionNomina,
      PagoNomina,
      AplicacionPagoNomina,
      CierreNomina,
      ObligacionEmpleado,
      CfdiNomina,
      DispersionNomina,
      DispersionNominaDetalle,
      PolizaNominaDetalle,
      CuentaBancariaEmpleado,
      MovimientoPrestamoNomina,
      AplicacionObligacionNomina,
      EventoNomina,
      Banco,
      ConfiguracionAprobacion,
      AprobacionDocumento,
          // Para comprobar, antes de bloquear el periodo, que la cadena de firmas
      // tiene quien la firme. Ver `prepararAprobacion`.
      Usuario,
]),
  ],
  controllers: [RrhhController, NominaAvanzadaController, EstructuraOrganizacionalController],
  providers: [RrhhService, NominaCalculoService, NominaAvanzadaService, EstructuraOrganizacionalService],
  exports: [RrhhService, NominaCalculoService],
})
export class RrhhModule {}
