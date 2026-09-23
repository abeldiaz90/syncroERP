import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

export enum EstadoAprobacionNomina { PENDIENTE='PENDIENTE', APROBADA='APROBADA', RECHAZADA='RECHAZADA' }
export enum EstadoPagoNomina { BORRADOR='BORRADOR', PARCIAL='PARCIAL', PAGADO='PAGADO', CANCELADO='CANCELADO' }
export enum EstadoPrestamo { ACTIVO='ACTIVO', LIQUIDADO='LIQUIDADO', SUSPENDIDO='SUSPENDIDO', CANCELADO='CANCELADO' }

@Entity('rrhh_configuracion_patronal')
@Index(['empresaId'], { unique: true })
export class ConfiguracionPatronal {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'varchar', length: 180 }) razonSocial!: string;
  @Column({ type: 'varchar', length: 13 }) rfc!: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) registroPatronal?: string;
  @Column({ type: 'varchar', length: 10, nullable: true }) claseRiesgo?: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 9, scale: 6, default: 0 }) primaRiesgo!: number;
  @Column({ type: 'varchar', length: 3, default: 'MXN' }) moneda!: string;
  @Column({ type: 'varchar', length: 2, nullable: true }) estadoIsn?: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 7, scale: 4, default: 0 }) tasaIsn!: number;
  @Column({ type: 'varchar', length: 120, nullable: true }) bancoDispersion?: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) cuentaDispersion?: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) proveedorPac?: string;
  @Column({ type: 'varchar', length: 30, default: 'NO_CONFIGURADO' }) estadoPac!: string;
  @Column({ type: 'uuid', nullable: true }) cuentaNominaPorPagarId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaBancoNominaId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaIsrRetenidoId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaImssObreroId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaImssPatronalId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaInfonavitId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaFonacotId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaIsnId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaGastoImssPatronalId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaGastoInfonavitId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaGastoIsnId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaPrestamosEmpleadoId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaPensionId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaEmbargosId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaOtrasDeduccionesId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaSubsidioEmpleoId?: string;
  @Column({ default: false }) permiteCierreSinTimbrar!: boolean;
  @Column({ type: 'varchar', length: 500, nullable: true }) observaciones?: string;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

@Entity('rrhh_conceptos_empleado')
@Index(['empresaId', 'empleadoId', 'conceptoId', 'vigenciaDesde'], { unique: true })
export class ConceptoEmpleado {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'uuid' }) conceptoId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 6, default: 0 }) valor!: number;
  @Column({ type: 'varchar', length: 20, default: 'IMPORTE' }) tipoValor!: string;
  @Column({ type: 'date' }) vigenciaDesde!: Date;
  @Column({ type: 'date', nullable: true }) vigenciaHasta?: Date;
  @Column({ default: true }) activo!: boolean;
  @Column({ type: 'varchar', length: 300, nullable: true }) observaciones?: string;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_prestamos')
@Index(['empresaId', 'empleadoId', 'estado'])
export class PrestamoEmpleado {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'varchar', length: 30 }) tipo!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) referencia?: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) montoOriginal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) saldo!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) descuentoPeriodo!: number;
  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date', nullable: true }) fechaFin?: Date;
  @Column({ type: 'varchar', length: 20, default: EstadoPrestamo.ACTIVO }) estado!: EstadoPrestamo;
  @Column({ type: 'varchar', length: 300, nullable: true }) observaciones?: string;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/**
 * Una nomina puede enviarse a aprobacion mas de una vez, y por eso hay ciclo.
 *
 * Rechazar es el camino normal: alguien mira la prenomina, ve algo mal, la
 * rechaza, se corrige y se vuelve a enviar. Pero el indice unico era
 * (empresa, periodo, nivel), asi que en toda la vida del periodo solo cabia un
 * flujo. `prepararAprobacion` lo comprobaba y devolvia «El flujo de aprobacion
 * ya fue preparado»: una nomina rechazada no podia volver a enviarse nunca.
 * Quedaba calculable y jamas aprobable.
 *
 * El ciclo entra en el indice. Cada envio abre uno nuevo, los anteriores
 * quedan como historia —incluidos los niveles que se quedaron pendientes
 * cuando otro rechazo— y solo el vigente se puede firmar.
 */
@Entity('rrhh_aprobaciones_nomina')
@Index(['empresaId', 'periodoId', 'ciclo', 'nivel'], { unique: true })
export class AprobacionNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'int', default: 1 }) ciclo!: number;
  @Column({ type: 'int' }) nivel!: number;
  @Column({ type: 'varchar', length: 80 }) rolRequerido!: string;
  @Column({ type: 'uuid', nullable: true }) usuarioAprobadorId?: string;
  @Column({ type: 'int', default: 24 }) tiempoLimiteHoras!: number;
  @Column({ type: 'timestamptz', nullable: true }) fechaVencimiento?: Date;
  @Column({ type: 'uuid', nullable: true }) preparadaPorId?: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) hashCalculoEsperado?: string;
  @Column({ type: 'varchar', length: 20, default: EstadoAprobacionNomina.PENDIENTE }) estado!: EstadoAprobacionNomina;
  @Column({ type: 'uuid', nullable: true }) resueltaPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaResolucion?: Date;
  @Column({ type: 'varchar', length: 500, nullable: true }) comentario?: string;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_pagos_nomina')
@Index(['empresaId', 'periodoId'], { unique: true })
export class PagoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) totalPeriodo!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) totalAplicado!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) saldo!: number;
  @Column({ type: 'varchar', length: 20, default: EstadoPagoNomina.BORRADOR }) estado!: EstadoPagoNomina;
  @Column({ type: 'varchar', length: 100, nullable: true }) idempotencyKey?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaPago?: Date;
  @Column({ type: 'uuid', nullable: true }) polizaPagoId?: string;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
  @VersionColumn({ default: 1 }) version!: number;
}

@Entity('rrhh_aplicaciones_pago_nomina')
@Index(['pagoNominaId', 'referencia'])
export class AplicacionPagoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) pagoNominaId!: string;
  @Column({ type: 'varchar', length: 30 }) metodo!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) monto!: number;
  @Column({ type: 'varchar', length: 120, nullable: true }) referencia?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaFinancieraId?: string;
  @Column({ type: 'varchar', length: 3, default: 'MXN' }) moneda!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 6, default: 1 }) tipoCambio!: number;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_cierres_nomina')
@Index(['empresaId', 'periodoId'], { unique: true })
export class CierreNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) totalPercepciones!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) totalDeducciones!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) totalNeto!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) totalPagado!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) cargos!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) abonos!: number;
  @Column({ type: 'varchar', length: 30, default: 'CONTABILIZADO' }) estadoContable!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) folioPoliza?: string;
  @Column({ type: 'uuid', nullable: true }) polizaPagoId?: string;
  @Column({ type: 'uuid' }) cerradoPorId!: string;
  @CreateDateColumn() fechaCierre!: Date;
}

export enum TipoObligacionEmpleado { INFONAVIT='INFONAVIT', FONACOT='FONACOT', PENSION='PENSION', EMBARGO='EMBARGO', OTRO='OTRO' }
export enum EstadoCfdiNomina { BORRADOR='BORRADOR', PENDIENTE_PAC='PENDIENTE_PAC', TIMBRADO='TIMBRADO', ERROR='ERROR', CANCELADO='CANCELADO', SUSTITUIDO='SUSTITUIDO' }
export enum EstadoDispersion { BORRADOR='BORRADOR', GENERADA='GENERADA', ENVIADA='ENVIADA', PARCIAL='PARCIAL', CONCILIADA='CONCILIADA', CANCELADA='CANCELADA' }

@Entity('rrhh_obligaciones_empleado')
@Index(['empresaId','empleadoId','tipo','referencia'], { unique: true })
export class ObligacionEmpleado {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type:'varchar', length:20 }) tipo!: TipoObligacionEmpleado;
  @Column({ type:'varchar', length:80 }) referencia!: string;
  @Column({ type:'varchar', length:20, default:'CUOTA_FIJA' }) modalidad!: string;
  @Column({ type:'varchar', length:30, default:'PERCEPCIONES' }) baseCalculo!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:6 }) valor!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:2, default:0 }) saldo!: number;
  @Column({ type:'int', default:50 }) prioridad!: number;
  @Column({ type:'date' }) vigenciaDesde!: Date;
  @Column({ type:'date', nullable:true }) vigenciaHasta?: Date;
  @Column({ default:true }) activo!: boolean;
  @Column({ type:'varchar', length:400, nullable:true }) observaciones?: string;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

@Entity('rrhh_cfdi_nomina')
@Index(['empresaId','reciboId'], { unique:true })
export class CfdiNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'uuid' }) reciboId!: string;
  @Column({ type:'varchar', length:20, default:EstadoCfdiNomina.BORRADOR }) estado!: EstadoCfdiNomina;
  @Column({ type:'varchar', length:40, nullable:true }) uuidFiscal?: string;
  @Column({ type:'varchar', length:80, nullable:true }) proveedorPac?: string;
  @Column({ type: 'text', nullable:true }) xmlSolicitud?: string;
  @Column({ type: 'text', nullable:true }) xmlTimbrado?: string;
  @Column({ type: 'text', nullable:true }) acuseCancelacion?: string;
  @Column({ type:'varchar', length:500, nullable:true }) ultimoError?: string;
  @Column({ type:'int', default:0 }) intentos!: number;
  @Column({ type: 'uuid', nullable:true }) cfdiSustituyeId?: string;
  @Column({ type: 'timestamptz', nullable:true }) fechaTimbrado?: Date;
  @Column({ type: 'timestamptz', nullable:true }) fechaCancelacion?: Date;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
  @VersionColumn({ default: 1 }) version!: number;
}

@Entity('rrhh_dispersiones_nomina')
@Index(['empresaId','periodoId'], { unique:true })
export class DispersionNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type:'varchar', length:80 }) banco!: string;
  @Column({ type:'varchar', length:20, default:EstadoDispersion.BORRADOR }) estado!: EstadoDispersion;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:2, default:0 }) total!: number;
  @Column({ type:'int', default:0 }) registros!: number;
  @Column({ type:'varchar', length:120, nullable:true }) nombreArchivo?: string;
  @Column({ type: 'text', nullable:true }) contenidoArchivo?: string;
  @Column({ type:'varchar', length:120, nullable:true }) referenciaBanco?: string;
  @Column({ type:'varchar', length:64, nullable:true }) hashArchivo?: string;
  @Column({ type:'varchar', length:64, nullable:true }) hashRespuestaBanco?: string;
  @Column({ type: 'text', nullable:true }) evidenciaConciliacionJson?: string;
  @Column({ type: 'timestamptz', nullable:true }) fechaEnvio?: Date;
  @Column({ type: 'timestamptz', nullable:true }) fechaConciliacion?: Date;
  @Column({ type: 'uuid' }) creadoPorId!: string;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
  @VersionColumn({ default: 1 }) version!: number;
}

@Entity('rrhh_dispersiones_nomina_detalle')
@Index(['dispersionId','empleadoId'], { unique:true })
export class DispersionNominaDetalle {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) dispersionId!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'uuid' }) reciboId!: string;
  @Column({ type:'varchar', length:18 }) cuentaDestino!: string;
  @Column({ type:'varchar', length:120 }) beneficiario!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:2 }) monto!: number;
  @Column({ type:'varchar', length:20, default:'PENDIENTE' }) estado!: string;
  @Column({ type:'varchar', length:120, nullable:true }) referencia?: string;
  @Column({ type:'varchar', length:500, nullable:true }) mensajeBanco?: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:2, default:0 }) montoAceptado!: number;
  @Column({ type: 'timestamptz', nullable:true }) fechaResultado?: Date;
}

@Entity('rrhh_polizas_nomina_detalle')
@Index(['empresaId','periodoId','numeroLinea'], { unique:true })
export class PolizaNominaDetalle {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type:'int' }) numeroLinea!: number;
  @Column({ type:'varchar', length:30 }) cuenta!: string;
  @Column({ type:'varchar', length:200 }) descripcion!: string;
  @Column({ type:'varchar', length:120, nullable:true }) centroCostos?: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:2, default:0 }) cargo!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:2, default:0 }) abono!: number;
  @Column({ type:'varchar', length:20, nullable:true }) conceptoClave?: string;
  @CreateDateColumn() fechaCreacion!: Date;
}


export enum EstadoCuentaBancariaEmpleado { ACTIVA='ACTIVA', INACTIVA='INACTIVA', BLOQUEADA='BLOQUEADA' }
export enum EstadoValidacionCuentaBancaria { PENDIENTE='PENDIENTE', VALIDADA='VALIDADA', RECHAZADA='RECHAZADA' }

@Entity('rrhh_cuentas_bancarias_empleado')
@Index(['empresaId','empleadoId','clabeHash'], { unique:true })
export class CuentaBancariaEmpleado {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type:'varchar', length:3, nullable:true }) bancoClave?: string;
  @Column({ type:'varchar', length:120 }) bancoNombre!: string;
  @Column({ type:'varchar', length:18, nullable:true }) clabe?: string;
  @Column({ type: 'text', nullable:true }) clabeCifrada?: string;
  @Column({ type:'varchar', length:64, nullable:true }) clabeHash?: string;
  @Column({ type:'varchar', length:20, nullable:true }) numeroCuenta?: string;
  @Column({ type:'varchar', length:4, nullable:true }) numeroTarjetaUltimos4?: string;
  @Column({ type:'varchar', length:120 }) titular!: string;
  @Column({ type:'varchar', length:3, default:'MXN' }) moneda!: string;
  @Column({ default:false }) principal!: boolean;
  @Column({ type:'varchar', length:20, default:EstadoCuentaBancariaEmpleado.ACTIVA }) estado!: EstadoCuentaBancariaEmpleado;
  @Column({ type:'varchar', length:20, default:EstadoValidacionCuentaBancaria.PENDIENTE }) estadoValidacion!: EstadoValidacionCuentaBancaria;
  @Column({ type:'varchar', length:300, nullable:true }) motivoValidacion?: string;
  @Column({ type:'varchar', length:4, nullable:true }) clabeUltimos4?: string;
  @Column({ type: 'timestamptz', nullable:true }) fechaValidacion?: Date;
  @Column({ type: 'uuid', nullable:true }) validadaPorId?: string;
  @Column({ type:'varchar', length:300, nullable:true }) observaciones?: string;
  @Column({ type: 'uuid', nullable:true }) creadaPorId?: string;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
  @VersionColumn({ default: 1 }) version!: number;
}


export enum EstadoMovimientoNomina {
  CALCULADO = 'CALCULADO',
  APLICADO = 'APLICADO',
  REVERTIDO = 'REVERTIDO',
}

@Entity('rrhh_movimientos_prestamo_nomina')
@Index(['empresaId', 'prestamoId', 'reciboId'], { unique: true })
export class MovimientoPrestamoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'uuid' }) reciboId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'uuid' }) prestamoId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) importe!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) saldoAntes!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) saldoDespues!: number;
  @Column({ type: 'varchar', length: 20, default: EstadoMovimientoNomina.CALCULADO }) estado!: EstadoMovimientoNomina;
  @Column({ type: 'timestamptz', nullable: true }) fechaAplicacion?: Date;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_aplicaciones_obligacion_nomina')
@Index(['empresaId', 'obligacionId', 'reciboId'], { unique: true })
export class AplicacionObligacionNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'uuid' }) reciboId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'uuid' }) obligacionId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) importe!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) saldoAntes!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) saldoDespues!: number;
  @Column({ type: 'varchar', length: 20, default: EstadoMovimientoNomina.CALCULADO }) estado!: EstadoMovimientoNomina;
  @Column({ type: 'timestamptz', nullable: true }) fechaAplicacion?: Date;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_eventos_nomina')
@Index(['empresaId', 'periodoId', 'fechaCreacion'])
export class EventoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) periodoId!: string;
  @Column({ type: 'uuid', nullable: true }) reciboId?: string;
  @Column({ type: 'varchar', length: 50 }) tipo!: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) estadoAnterior?: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) estadoNuevo?: string;
  @Column({ type: 'uuid', nullable: true }) usuarioId?: string;
  @Column({ type: 'text', nullable: true }) detalleJson?: string;
  @CreateDateColumn() fechaCreacion!: Date;
}
