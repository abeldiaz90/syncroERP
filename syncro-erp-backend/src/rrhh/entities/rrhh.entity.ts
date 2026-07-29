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
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

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
  CALCULADO = 'CALCULADO',
  CERRADO = 'CERRADO',
  CANCELADO = 'CANCELADO',
}

/* ── Puesto ───────────────────────────────────────────────────────────────── */

@Entity('rrhh_puestos')
@Index(['empresaId', 'clave'], { unique: true })
export class Puesto {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'varchar', length: 120 }) nombre!: string;
  @Column({ type: 'varchar', length: 400, nullable: true }) descripcion?: string;

  @Column({ type: 'uniqueidentifier', nullable: true }) departamentoId?: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) salarioMinimo!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) salarioMaximo!: number;

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
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) numeroEmpleado!: string;

  /* Identidad */
  @Column({ type: 'varchar', length: 80 }) nombres!: string;
  @Column({ type: 'varchar', length: 80 }) apellidoPaterno!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) apellidoMaterno?: string;
  @Column({ type: 'varchar', length: 18, nullable: true }) curp?: string;
  @Column({ type: 'varchar', length: 13, nullable: true }) rfc?: string;
  @Column({ type: 'varchar', length: 11, nullable: true }) nss?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: Date;
  @Column({ type: 'varchar', length: 1, nullable: true }) sexo?: string;

  /* Contacto */
  @Column({ type: 'varchar', length: 120, nullable: true }) email?: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefono?: string;
  @Column({ type: 'varchar', length: 250, nullable: true }) direccion?: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) contactoEmergencia?: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefonoEmergencia?: string;

  /* Relación laboral */
  @ManyToOne(() => Puesto, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'puestoId' })
  puesto?: Puesto;
  @Column({ type: 'uniqueidentifier', nullable: true }) puestoId?: string;

  @Column({ type: 'uniqueidentifier', nullable: true }) departamentoId?: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) jefeDirectoId?: string;
  /** Cuenta del ERP, si la persona además es usuaria del sistema. */
  @Column({ type: 'uniqueidentifier', nullable: true }) usuarioId?: string;

  @Column({ type: 'date' }) fechaIngreso!: Date;
  @Column({ type: 'date', nullable: true }) fechaBaja?: Date;
  @Column({ type: 'varchar', length: 200, nullable: true }) motivoBaja?: string;

  @Column({ type: 'varchar', length: 30, default: TipoContrato.INDETERMINADO })
  tipoContrato!: TipoContrato;

  @Column({ type: 'varchar', length: 20, default: RegimenPago.QUINCENAL })
  regimenPago!: RegimenPago;

  /* Percepciones base */
  @Column({ type: 'decimal', precision: 18, scale: 2 }) salarioDiario!: number;
  /** Salario base de cotización para el IMSS (incluye prestaciones). */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) salarioDiarioIntegrado!: number;

  @Column({ type: 'int', default: 15 }) diasAguinaldo!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 25 }) primaVacacional!: number;

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
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @Column({ type: 'uniqueidentifier' }) empleadoId!: string;

  @Column({ type: 'date' }) fecha!: Date;
  @Column({ type: 'datetime2', nullable: true }) entrada?: Date;
  @Column({ type: 'datetime2', nullable: true }) salida?: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) horasTrabajadas!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) horasExtra!: number;
  @Column({ type: 'int', default: 0 }) minutosRetardo!: number;

  @Column({ type: 'varchar', length: 200, nullable: true }) observaciones?: string;
  @CreateDateColumn() fechaRegistro!: Date;
}

/* ── Incidencia ───────────────────────────────────────────────────────────── */

@Entity('rrhh_incidencias')
@Index(['empresaId', 'fechaInicio'])
export class Incidencia {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @Column({ type: 'uniqueidentifier' }) empleadoId!: string;

  @Column({ type: 'varchar', length: 30 }) tipo!: TipoIncidencia;
  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date' }) fechaFin!: Date;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) dias!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) horas!: number;

  /** ¿Se paga? Vacaciones sí, falta no. Determina el efecto en nómina. */
  @Column({ default: true }) pagada!: boolean;

  @Column({ type: 'varchar', length: 400, nullable: true }) motivo?: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) folioIncapacidad?: string;

  @Column({ default: false }) aprobada!: boolean;
  @Column({ type: 'uniqueidentifier', nullable: true }) aprobadaPorId?: string;
  @Column({ type: 'datetime2', nullable: true }) fechaAprobacion?: Date;

  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Concepto de nómina ───────────────────────────────────────────────────── */

@Entity('rrhh_conceptos')
@Index(['empresaId', 'clave'], { unique: true })
export class ConceptoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'varchar', length: 120 }) nombre!: string;
  @Column({ type: 'varchar', length: 20 }) naturaleza!: NaturalezaConcepto;

  /** Clave del catálogo c_TipoPercepcion / c_TipoDeduccion del SAT. */
  @Column({ type: 'varchar', length: 10, nullable: true }) claveSat?: string;

  @Column({ default: true }) gravaIsr!: boolean;
  @Column({ default: true }) integraSbc!: boolean;
  @Column({ default: false }) esFijo!: boolean;

  @Column({ type: 'uniqueidentifier', nullable: true }) cuentaContableId?: string;

  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Periodo de nómina ────────────────────────────────────────────────────── */

@Entity('rrhh_periodos_nomina')
@Index(['empresaId', 'ejercicio', 'numero'], { unique: true })
export class PeriodoNomina {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;

  @Column({ type: 'int' }) ejercicio!: number;
  @Column({ type: 'int' }) numero!: number;
  @Column({ type: 'varchar', length: 20 }) regimen!: RegimenPago;

  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date' }) fechaFin!: Date;
  @Column({ type: 'date' }) fechaPago!: Date;
  @Column({ type: 'int' }) diasPeriodo!: number;

  @Column({ type: 'varchar', length: 20, default: EstadoPeriodo.ABIERTO })
  estado!: EstadoPeriodo;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) totalPercepciones!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) totalDeducciones!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) totalNeto!: number;
  @Column({ type: 'int', default: 0 }) empleadosCalculados!: number;

  @Column({ type: 'uniqueidentifier', nullable: true }) polizaId?: string;

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
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;

  @ManyToOne(() => PeriodoNomina, (p) => p.recibos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'periodoId' })
  periodo!: PeriodoNomina;
  @Column({ type: 'uniqueidentifier' }) periodoId!: string;

  @Column({ type: 'uniqueidentifier' }) empleadoId!: string;
  @Column({ type: 'varchar', length: 200 }) nombreEmpleado!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 }) diasPagados!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2 }) salarioDiario!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) totalPercepciones!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) totalDeducciones!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) neto!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) baseGravable!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) isrRetenido!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) imssRetenido!: number;

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
  @JoinColumn({ name: 'reciboId' })
  recibo!: ReciboNomina;
  @Column({ type: 'uniqueidentifier' }) reciboId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'varchar', length: 120 }) concepto!: string;
  @Column({ type: 'varchar', length: 20 }) naturaleza!: NaturalezaConcepto;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) cantidad!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) importeGravado!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) importeExento!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2 }) importe!: number;
}
