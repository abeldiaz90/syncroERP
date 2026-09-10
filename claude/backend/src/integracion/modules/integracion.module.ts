import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '../../common/modules/common.module';
import { AuditoriaModule } from '../../auditoria/modules/auditoria.module';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { CreditoCliente } from '../../credito/entities/credito-cliente.entity';
import { ProductoCredito } from '../../credito/entities/producto-credito.entity';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { PartidaPoliza } from '../../finanzas/entities/partida-poliza.entity';
import { Poliza } from '../../finanzas/entities/poliza.entity';

import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { DiscrepanciaIntegracion } from '../entities/discrepancia-integracion.entity';
import { EventoIntegracion } from '../entities/evento-integracion.entity';
import { MapeoCuentaExterna } from '../entities/mapeo-cuenta-externa.entity';
import { MapeoRolExterno } from '../entities/mapeo-rol-externo.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { Empresa } from '../../iam/entities/empresa.entity';
import { VinculoIntegracion } from '../entities/vinculo-integracion.entity';
import { AvisoIntegracion } from '../entities/aviso-integracion.entity';
import { TenantReserva } from '../entities/tenant-reserva.entity';

import {
  PUERTO_BURO_CREDITO,
  PUERTO_VALIDACION_IDENTIDAD,
} from '../integracion.constants';
import { BuroNoConfigurado } from '../ports/buro-credito.port';
import { ValidacionIdentidadNoConfigurada } from '../ports/validacion-identidad.port';

import { IntegracionController } from '../controllers/integracion.controller';
import { AvisosIntegracionController } from '../controllers/avisos-integracion.controller';
import { AltaEmpresasController } from '../controllers/alta-empresas.controller';
import { AccesoExternoService } from '../services/acceso-externo.service';
import { AvisosIntegracionService } from '../services/avisos-integracion.service';
import { AltaEmpresasService } from '../services/alta-empresas.service';
import { CarteraConciliacionService } from '../services/cartera-conciliacion.service';
import { CarteraPublicadorService } from '../services/cartera-publicador.service';
import { ContabilidadPublicadorService } from '../services/contabilidad-publicador.service';
import { DecisionCreditoService } from '../services/decision-credito.service';
import { DisponibilidadCreditoService } from '../services/disponibilidad-credito.service';
import { IntegracionDespachadorService } from '../services/integracion-despachador.service';
import { IntegracionModoService } from '../services/integracion-modo.service';
import { IntegracionOutboxService } from '../services/integracion-outbox.service';
import { IntegracionVinculosService } from '../services/integracion-vinculos.service';
import { MapeoCuentasService } from '../services/mapeo-cuentas.service';
import { RolesExternosService } from '../services/roles-externos.service';
import { PolizaEspejoSubscriber } from '../services/poliza-espejo.subscriber';

// ── Flujos de validación previos al crédito ─────────────────────────────────
import { REGISTRO_EVALUADORES } from '../validacion/validacion.constants';
import { ValidacionController } from '../validacion/validacion.controller';
import { EjecucionValidacion } from '../validacion/entities/ejecucion-validacion.entity';
import { FlujoValidacion } from '../validacion/entities/flujo-validacion.entity';
import { PasoFlujoValidacion } from '../validacion/entities/paso-flujo-validacion.entity';
import { ResultadoPasoValidacion } from '../validacion/entities/resultado-paso.entity';
import { FlujosValidacionService } from '../validacion/services/flujos-validacion.service';
import { MotorValidacionService } from '../validacion/services/motor-validacion.service';
import {
  EvaluadorBuroCredito,
  EvaluadorCirculoCredito,
  EvaluadorHistorialInterno,
  EvaluadorIdentidadIne,
  EvaluadorListaBloqueo,
  EvaluadorPoliticaInterna,
  EvaluadorRevisionManual,
} from '../validacion/evaluadores/evaluadores';

// ── Proveedor del registro externo ──────────────────────────────────────────
// Ésta es la única línea que hay que cambiar para sustituir a Fineract.
import { FineractAdapterModule } from '../adaptadores/fineract/fineract.module';

/**
 * Integración con un registro financiero externo.
 *
 * Cubre dos ejes independientes, ambos apagados por omisión:
 *
 *   · CARTERA      — el externo lleva los créditos, la amortización y la mora.
 *   · CONTABILIDAD — las pólizas del ERP se espejan en el mayor del externo.
 *
 * Una empresa que no contrató el módulo tiene ambos en APAGADO y no nota nada:
 * su contabilidad y su cartera siguen viviendo enteramente en el ERP.
 *
 * No importa CreditoModule, ClientesModule ni FinanzasModule: toma sus entidades
 * por repositorio. Es a propósito — esos módulos sí importan éste para publicar
 * hechos, y una dependencia en ambos sentidos sería un ciclo que NestJS sólo
 * resolvería con forwardRef, que es una deuda que no hace falta contraer.
 *
 * El proveedor concreto entra por `FineractAdapterModule`. Nada de lo que vive
 * aquí sabe qué hay detrás de los dos puertos.
 */
@Module({
  imports: [
    AuditoriaModule,
    TypeOrmModule.forFeature([
      VinculoIntegracion,
      AvisoIntegracion,
      TenantReserva,
      Empresa,
      EventoIntegracion,
      DiscrepanciaIntegracion,
      ConfiguracionIntegracionEmpresa,
      MapeoCuentaExterna,
      MapeoRolExterno,
      Usuario,
      Cliente,
      CreditoCliente,
      ProductoCredito,
      CuentaContable,
      Poliza,
      PartidaPoliza,
      FlujoValidacion,
      PasoFlujoValidacion,
      EjecucionValidacion,
      ResultadoPasoValidacion,
    ]),
    CommonModule,
    FineractAdapterModule,
  ],
  controllers: [
    IntegracionController,
    AvisosIntegracionController,
    AltaEmpresasController,
    ValidacionController,
  ],
  providers: [
    AltaEmpresasService,
    AvisosIntegracionService,
    IntegracionModoService,
    IntegracionVinculosService,
    IntegracionOutboxService,
    IntegracionDespachadorService,
    CarteraPublicadorService,
    CarteraConciliacionService,
    ContabilidadPublicadorService,
    MapeoCuentasService,
    RolesExternosService,
    DisponibilidadCreditoService,
    DecisionCreditoService,
    AccesoExternoService,
    PolizaEspejoSubscriber,
    {
      provide: PUERTO_VALIDACION_IDENTIDAD,
      useClass: ValidacionIdentidadNoConfigurada,
    },
    { provide: PUERTO_BURO_CREDITO, useClass: BuroNoConfigurado },

    // ── Flujos de validación ────────────────────────────────────────────────
    EvaluadorIdentidadIne,
    EvaluadorBuroCredito,
    EvaluadorCirculoCredito,
    EvaluadorHistorialInterno,
    EvaluadorListaBloqueo,
    EvaluadorPoliticaInterna,
    EvaluadorRevisionManual,
    {
      // El motor recorre el flujo sin saber qué evaluadores existen: los recibe
      // como lista. Agregar un proveedor nuevo —cuando migren los componentes
      // de la suite de SUMA— es escribir una clase y sumarla aquí.
      provide: REGISTRO_EVALUADORES,
      useFactory: (...evaluadores: unknown[]) => evaluadores,
      inject: [
        EvaluadorIdentidadIne,
        EvaluadorBuroCredito,
        EvaluadorCirculoCredito,
        EvaluadorHistorialInterno,
        EvaluadorListaBloqueo,
        EvaluadorPoliticaInterna,
        EvaluadorRevisionManual,
      ],
    },
    FlujosValidacionService,
    MotorValidacionService,
  ],
  exports: [
    // Se reexporta el módulo del proveedor —no el símbolo— para que el catálogo
    // de productos, que vive en el módulo de crédito, pueda inyectar el puerto
    // sin que se forme un ciclo entre los dos módulos.
    FineractAdapterModule,
    CarteraPublicadorService,
    ContabilidadPublicadorService,
    DisponibilidadCreditoService,
    DecisionCreditoService,
    IntegracionVinculosService,
    IntegracionModoService,
    RolesExternosService,
    MotorValidacionService,
    FlujosValidacionService,
  ],
})
export class IntegracionModule {}
