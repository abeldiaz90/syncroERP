import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
/**
 * ============================================================================
 * SyncroERP · Recursos humanos — entidades
 * ----------------------------------------------------------------------------
 * Módulo nuevo. El ERP tenía `usuarios` (quién entra al sistema) y
 * `departamentos`, pero no tenía empleados: no había forma de saber quién
 * trabaja en la empresa si no usa el software, ni de registrar asistencia,
 * ni de calcular nómina.
 *
 * Separación deliberada: `Empleado` NO es `Usuario`. La mayoría de la plantilla
 * de un hotel o una tienda no tiene cuenta en el ERP. Se relacionan opcional-
 * mente por `usuarioId` cuando la persona sí es usuaria.
 * ============================================================================
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Departamento } from '../../departamentos/entities/departamento.entity';

export enum TipoContrato {
  INDETERMINADO = 'INDETERMINADO',
  DETERMINADO = 'DETERMINADO',
  POR_OBRA = 'POR_OBRA',
  CAPACITACION = 'CAPACITACION',
  HONORARIOS = 'HONORARIOS',
}

export enum RegimenPago {
  QUINCENAL = 'QUINCENAL',
  SEMANAL = 'SEMANAL',
  CATORCENAL = 'CATORCENAL',
  MENSUAL = 'MENSUAL',
}

export enum TipoSalario {
  FIJO = 'FIJO',
  VARIABLE = 'VARIABLE',
  MIXTO = 'MIXTO',
}

export enum JornadaLaboral {
  DIURNA = 'DIURNA',
  NOCTURNA = 'NOCTURNA',
  MIXTA = 'MIXTA',
}

export enum EstadoEmpleado {
  ACTIVO = 'ACTIVO',
  INCAPACIDAD = 'INCAPACIDAD',
  VACACIONES = 'VACACIONES',
  PERMISO = 'PERMISO',
  BAJA = 'BAJA',
}

export enum TipoIncidencia {
  FALTA = 'FALTA',
  RETARDO = 'RETARDO',
  INCAPACIDAD = 'INCAPACIDAD',
  VACACIONES = 'VACACIONES',
  PERMISO_CON_GOCE = 'PERMISO_CON_GOCE',
  PERMISO_SIN_GOCE = 'PERMISO_SIN_GOCE',
  HORAS_EXTRA = 'HORAS_EXTRA',
}

export enum NaturalezaConcepto {
  PERCEPCION = 'PERCEPCION',
  DEDUCCION = 'DEDUCCION',
  OTRO_PAGO = 'OTRO_PAGO',
}

export enum EstadoPeriodo {
  ABIERTO = 'ABIERTO',
  CALCULANDO = 'CALCULANDO',
  CALCULADO = 'CALCULADO',
  CON_ALERTAS = 'CON_ALERTAS',
  EN_REVISION = 'EN_REVISION',
  APROBADO = 'APROBADO',
  CFDI_PREPARADO = 'CFDI_PREPARADO',
  TIMBRADO = 'TIMBRADO',
  DISPERSION_GENERADA = 'DISPERSION_GENERADA',
  EN_DISPERSION = 'EN_DISPERSION',
  PAGADO = 'PAGADO',
  CONTABILIZADO = 'CONTABILIZADO',
  CERRADO = 'CERRADO',
  CANCELADO = 'CANCELADO',
  REVERTIDO = 'REVERTIDO',
}

/* ── Puesto ───────────────────────────────────────────────────────────────── */

@Entity('rrhh_puestos')
@Index(['empresaId', 'clave'], { unique: true })
export class Puesto {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'varchar', length: 120 }) nombre!: string;
  @Column({ type: 'varchar', length: 400, nullable: true })
  descripcion?: string;

  @Column({ type: 'uuid' }) departamentoId!: string;
  @ManyToOne(() => Departamento, { nullable: false })
  @JoinColumn({ name: 'departamentoid' })
  departamento!: Departamento;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  salarioMinimo!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  salarioMaximo!: number;

  /** Plazas autorizadas: permite detectar sobrecontratación. */
  @Column({ type: 'int', default: 0 }) plazasAutorizadas!: number;

  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Empleado ─────────────────────────────────────────────────────────────── */

@Entity('rrhh_empleados')
@Index(['empresaId', 'numeroEmpleado'], { unique: true })
@Index(['empresaId', 'estado'])
export class Empleado {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) numeroEmpleado!: string;

  /* Identidad */
  @Column({ type: 'varchar', length: 80 }) nombres!: string;
  @Column({ type: 'varchar', length: 80 }) apellidoPaterno!: string;
  @Column({ type: 'varchar', length: 80, nullable: true })
  apellidoMaterno?: string;
  @Column({ type: 'varchar', length: 18, nullable: true }) curp?: string;
  @Column({ type: 'varchar', length: 13, nullable: true }) rfc?: string;
  @Column({ type: 'varchar', length: 11, nullable: true }) nss?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: Date;
  @Column({ type: 'varchar', length: 1, nullable: true }) sexo?: string;

  /* Contacto */
  @Column({ type: 'varchar', length: 120, nullable: true }) email?: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefono?: string;
  @Column({ type: 'varchar', length: 250, nullable: true }) direccion?: string;
  @Column({ type: 'varchar', length: 120, nullable: true })
  contactoEmergencia?: string;
  @Column({ type: 'varchar', length: 20, nullable: true })
  telefonoEmergencia?: string;

  /* Relación laboral */
  @ManyToOne(() => Puesto, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'puestoid' })
  puesto?: Puesto;
  @Column({ type: 'uuid', nullable: true }) puestoId?: string;

  @Column({ type: 'uuid', nullable: true }) departamentoId?: string;
  @Column({ type: 'uuid', nullable: true }) jefeDirectoId?: string;
  /** Cuenta del ERP, si la persona además es usuaria del sistema. */
  @Column({ type: 'uuid', nullable: true }) usuarioId?: string;

  @Column({ type: 'date' }) fechaIngreso!: Date;
  @Column({ type: 'date', nullable: true }) fechaBaja?: Date;
  @Column({ type: 'varchar', length: 200, nullable: true }) motivoBaja?: string;

  @Column({ type: 'varchar', length: 30, default: TipoContrato.INDETERMINADO })
  tipoContrato!: TipoContrato;

  @Column({ type: 'varchar', length: 20, default: RegimenPago.QUINCENAL })
  regimenPago!: RegimenPago;

  @Column({ type: 'varchar', length: 10, default: TipoSalario.FIJO })
  tipoSalario!: TipoSalario;

  @Column({ type: 'varchar', length: 10, default: JornadaLaboral.DIURNA })
  jornada!: JornadaLaboral;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 4, scale: 2, default: 8 })
  horasJornada!: number;

  @Column({ type: 'varchar', length: 20, default: 'GENERAL' })
  zonaSalarioMinimo!: 'GENERAL' | 'FRONTERA_NORTE';

  @Column({ default: false }) sbcValidado!: boolean;
  @Column({ type: 'date', nullable: true }) fechaSbc?: Date;

  @Column({ type: 'varchar', length: 5, nullable: true }) codigoPostalFiscal?: string;
  @Column({ type: 'varchar', length: 3, nullable: true }) regimenFiscal?: string;

  /* Percepciones base */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) salarioDiario!: number;
  /** Salario base de cotización para el IMSS (incluye prestaciones). */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  salarioDiarioIntegrado!: number;

  @Column({ type: 'int', default: 15 }) diasAguinaldo!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 25 })
  primaVacacional!: number;

  /* Pago */
  @Column({ type: 'varchar', length: 30, nullable: true }) banco?: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) clabe?: string;

  @Column({ type: 'varchar', length: 30, default: EstadoEmpleado.ACTIVO })
  estado!: EstadoEmpleado;

  @Column({ type: 'varchar', length: 500, nullable: true }) notas?: string;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/* ── Asistencia ───────────────────────────────────────────────────────────── */

@Entity('rrhh_asistencias')
@Index(['empleadoId', 'fecha'], { unique: true })
@Index(['empresaId', 'fecha'])
export class Asistencia {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;

  @Column({ type: 'date' }) fecha!: Date;
  @Column({ type: 'timestamptz', nullable: true }) entrada?: Date;
  @Column({ type: 'timestamptz', nullable: true }) salida?: Date;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 })
  horasTrabajadas!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 })
  horasExtra!: number;
  @Column({ type: 'int', default: 0 }) minutosRetardo!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  observaciones?: string;
  @CreateDateColumn() fechaRegistro!: Date;
}

/* ── Incidencia ───────────────────────────────────────────────────────────── */

@Entity('rrhh_incidencias')
@Index(['empresaId', 'fechaInicio'])
export class Incidencia {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;

  @Column({ type: 'varchar', length: 30 }) tipo!: TipoIncidencia;
  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date' }) fechaFin!: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 })
  dias!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 })
  horas!: number;

  /** ¿Se paga? Vacaciones sí, falta no. Determina el efecto en nómina. */
  @Column({ default: true }) pagada!: boolean;

  @Column({ type: 'varchar', length: 400, nullable: true }) motivo?: string;
  @Column({ type: 'varchar', length: 40, nullable: true })
  folioIncapacidad?: string;

  @Column({ default: false }) aprobada!: boolean;
  @Column({ type: 'varchar', length: 20, default: 'CAPTURADA' }) estadoAprobacion!: string;
  @Column({ type: 'uuid', nullable: true }) aprobadaPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaAprobacion?: Date;
  @Column({ type: 'uuid', nullable: true }) rechazadaPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaRechazo?: Date;
  @Column({ type: 'varchar', length: 400, nullable: true }) motivoRechazo?: string;

  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Concepto de nómina ───────────────────────────────────────────────────── */

@Entity('rrhh_conceptos')
@Index(['empresaId', 'clave'], { unique: true })
export class ConceptoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'varchar', length: 120 }) nombre!: string;
  @Column({ type: 'varchar', length: 20 }) naturaleza!: NaturalezaConcepto;

  /** Clave del catálogo c_TipoPercepcion / c_TipoDeduccion del SAT. */
  @Column({ type: 'varchar', length: 10, nullable: true }) claveSat?: string;

  @Column({ default: true }) gravaIsr!: boolean;
  @Column({ default: true }) integraSbc!: boolean;
  @Column({ default: false }) esFijo!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true }) formula?: string;
  @Column({ type: 'date', nullable: true }) vigenciaDesde?: Date;
  @Column({ type: 'date', nullable: true }) vigenciaHasta?: Date;

  @Column({ type: 'uuid', nullable: true })
  cuentaContableId?: string;

  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Periodo de nómina ────────────────────────────────────────────────────── */

@Entity('rrhh_periodos_nomina')
@Index(['empresaId', 'ejercicio', 'numero'], { unique: true })
export class PeriodoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'int' }) ejercicio!: number;
  @Column({ type: 'int' }) numero!: number;
  @Column({ type: 'varchar', length: 20 }) regimen!: RegimenPago;

  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date' }) fechaFin!: Date;
  @Column({ type: 'date' }) fechaPago!: Date;
  @Column({ type: 'int' }) diasPeriodo!: number;

  @Column({ type: 'varchar', length: 20, default: EstadoPeriodo.ABIERTO })
  estado!: EstadoPeriodo;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalPercepciones!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalDeducciones!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalNeto!: number;
  @Column({ type: 'int', default: 0 }) empleadosCalculados!: number;

  @Column({ type: 'uuid', nullable: true }) polizaId?: string;

  @Column({ type: 'int', default: 0 }) versionCalculo!: number;
  @Column({ type: 'varchar', length: 64, nullable: true }) hashCalculo?: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) motorVersion?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaCalculo?: Date;
  @Column({ default: false }) bloqueado!: boolean;
  @Column({ type: 'varchar', length: 300, nullable: true }) motivoBloqueo?: string;
  @Column({ type: 'uuid', nullable: true }) enviadoARevisionPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaEnvioRevision?: Date;
  @VersionColumn({ default: 1 }) version!: number;

  @OneToMany(() => ReciboNomina, (r) => r.periodo)
  recibos!: ReciboNomina[];

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/* ── Recibo ───────────────────────────────────────────────────────────────── */

@Entity('rrhh_recibos_nomina')
@Index(['periodoId', 'empleadoId'], { unique: true })
export class ReciboNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @ManyToOne(() => PeriodoNomina, (p) => p.recibos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'periodoid' })
  periodo!: PeriodoNomina;
  @Column({ type: 'uuid' }) periodoId!: string;

  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'varchar', length: 200 }) nombreEmpleado!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2 }) diasPagados!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) salarioDiario!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalPercepciones!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalDeducciones!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  neto!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  baseGravable!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  isrRetenido!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  imssRetenido!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) subsidioEmpleo!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) imssPatronal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) infonavitPatronal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) isn!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) costoEmpresa!: number;
  @Column({ type: 'int', default: 1 }) versionCalculo!: number;
  @Column({ type: 'varchar', length: 64, nullable: true }) hashRecibo?: string;
  @Column({ type: 'text', nullable: true }) snapshotJson?: string;

  @Column({ type: 'varchar', length: 40, nullable: true }) uuidCfdi?: string;
  @Column({ default: false }) timbrado!: boolean;

  @OneToMany(() => PartidaRecibo, (p) => p.recibo, { cascade: true })
  partidas!: PartidaRecibo[];

  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_partidas_recibo')
export class PartidaRecibo {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => ReciboNomina, (r) => r.partidas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reciboid' })
  recibo!: ReciboNomina;
  @Column({ type: 'uuid' }) reciboId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'uuid', nullable: true }) conceptoId?: string;
  @Column({ type: 'uuid', nullable: true }) cuentaContableId?: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) origenTipo?: string;
  @Column({ type: 'uuid', nullable: true }) origenId?: string;
  @Column({ type: 'int', default: 100 }) prioridad!: number;
  @Column({ type: 'varchar', length: 120 }) concepto!: string;
  @Column({ type: 'varchar', length: 20 }) naturaleza!: NaturalezaConcepto;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  cantidad!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  importeGravado!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  importeExento!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) importe!: number;
}

/* ── Fundamentos de madurez de nómina ───────────────────────────────────── */

export enum EstadoSolicitud {
  CAPTURADA = 'CAPTURADA',
  EN_REVISION = 'EN_REVISION',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CANCELADA = 'CANCELADA',
}

@Entity('rrhh_contratos_laborales')
@Index(['empresaId', 'empleadoId', 'fechaInicio'])
export class ContratoLaboral {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'varchar', length: 30 }) tipoContrato!: TipoContrato;
  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date', nullable: true }) fechaFin?: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) salarioDiario!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 }) salarioDiarioIntegrado!: number;
  @Column({ type: 'uuid', nullable: true }) puestoId?: string;
  @Column({ type: 'uuid', nullable: true }) departamentoId?: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) centroCostos?: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) observaciones?: string;
  @Column({ default: true }) vigente!: boolean;
  @Column({ type: 'uuid', nullable: true }) creadoPorId?: string;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_movimientos_laborales')
@Index(['empresaId', 'empleadoId', 'fechaEfectiva'])
export class MovimientoLaboral {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'varchar', length: 40 }) tipo!: string;
  @Column({ type: 'date' }) fechaEfectiva!: Date;
  @Column({ type: 'text', nullable: true }) valoresAnterioresJson?: string;
  @Column({ type: 'text', nullable: true }) valoresNuevosJson?: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) motivo?: string;
  @Column({ type: 'uuid', nullable: true }) usuarioId?: string;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_parametros_nomina')
@Index(['empresaId', 'clave', 'vigenciaDesde'], { unique: true })
export class ParametroNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'varchar', length: 80 }) clave!: string;
  @Column({ type: 'varchar', length: 160 }) nombre!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 20, scale: 6 }) valorNumero!: number;
  @Column({ type: 'varchar', length: 30, nullable: true }) unidad?: string;
  @Column({ type: 'date' }) vigenciaDesde!: Date;
  @Column({ type: 'date', nullable: true }) vigenciaHasta?: Date;
  @Column({ type: 'varchar', length: 500, nullable: true }) fuente?: string;
  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_solicitudes_vacaciones')
@Index(['empresaId', 'empleadoId', 'fechaInicio'])
export class SolicitudVacaciones {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date' }) fechaFin!: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2 }) diasSolicitados!: number;
  @Column({ type: 'varchar', length: 30, default: EstadoSolicitud.CAPTURADA }) estado!: EstadoSolicitud;
  @Column({ type: 'varchar', length: 400, nullable: true }) motivo?: string;
  @Column({ type: 'varchar', length: 400, nullable: true }) motivoResolucion?: string;
  @Column({ type: 'uuid', nullable: true }) solicitadaPorId?: string;
  @Column({ type: 'uuid', nullable: true }) resueltaPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaResolucion?: Date;
  @CreateDateColumn() fechaCreacion!: Date;
}

@Entity('rrhh_saldos_vacaciones')
@Index(['empresaId', 'empleadoId', 'aniversario'], { unique: true })
export class SaldoVacaciones {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) empleadoId!: string;
  @Column({ type: 'int' }) aniversario!: number;
  @Column({ type: 'date' }) vigenciaDesde!: Date;
  @Column({ type: 'date' }) vigenciaHasta!: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 6, scale: 2 }) diasDevengados!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 6, scale: 2, default: 0 }) diasArrastre!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 6, scale: 2, default: 0 }) diasReservados!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 6, scale: 2, default: 0 }) diasDisfrutados!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 6, scale: 2, default: 0 }) diasCancelados!: number;
  @VersionColumn({ default: 1 }) version!: number;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

@Entity('rrhh_calendario_laboral')
@Index(['empresaId', 'fecha'], { unique: true })
export class DiaCalendarioLaboral {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'date' }) fecha!: Date;
  @Column({ type: 'varchar', length: 160 }) descripcion!: string;
  @Column({ default: false }) laborable!: boolean;
  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}
