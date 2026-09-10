import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
/**
 * ============================================================================
 * SyncroERP · CRM — entidades
 * ----------------------------------------------------------------------------
 * Módulo nuevo. El ERP registraba clientes ya existentes, pero no había dónde
 * seguir a alguien ANTES de que comprara. Todo el trabajo comercial previo
 * vivía en hojas de cálculo o en la cabeza del vendedor.
 *
 * Decisión de modelo: las etapas del embudo son datos, no un enum. Cada empresa
 * vende distinto — un hotel no tiene el mismo proceso que una ferretería — y
 * codificar las etapas obliga a un despliegue cada vez que alguien quiere
 * agregar "Visita técnica".
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
} from 'typeorm';

export enum TipoEtapa {
  ABIERTA = 'ABIERTA',
  GANADA = 'GANADA',
  PERDIDA = 'PERDIDA',
}

export enum OrigenProspecto {
  REFERIDO = 'REFERIDO',
  SITIO_WEB = 'SITIO_WEB',
  REDES_SOCIALES = 'REDES_SOCIALES',
  LLAMADA_FRIA = 'LLAMADA_FRIA',
  FERIA = 'FERIA',
  CLIENTE_EXISTENTE = 'CLIENTE_EXISTENTE',
  OTRO = 'OTRO',
}

export enum TipoActividad {
  LLAMADA = 'LLAMADA',
  CORREO = 'CORREO',
  REUNION = 'REUNION',
  VISITA = 'VISITA',
  PROPUESTA = 'PROPUESTA',
  NOTA = 'NOTA',
}

/* ── Etapa del embudo ─────────────────────────────────────────────────────── */

@Entity('crm_etapas')
@Index(['empresaId', 'orden'])
export class EtapaEmbudo {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 80 }) nombre!: string;
  @Column({ type: 'int' }) orden!: number;

  @Column({ type: 'varchar', length: 20, default: TipoEtapa.ABIERTA })
  tipo!: TipoEtapa;

  /**
   * Probabilidad de cierre asociada a la etapa. Es lo que convierte el embudo
   * en un pronóstico: valor ponderado = importe × probabilidad.
   */
  @Column({ type: 'int', default: 50 }) probabilidad!: number;

  @Column({ type: 'varchar', length: 20, default: '#64748b' }) color!: string;

  /** Días tras los cuales una oportunidad en esta etapa se considera estancada. */
  @Column({ type: 'int', default: 15 }) diasAlerta!: number;

  @Column({ default: true }) activa!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Prospecto ────────────────────────────────────────────────────────────── */

@Entity('crm_prospectos')
@Index(['empresaId', 'nombre'])
export class Prospecto {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 160 }) nombre!: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) empresa?: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) puesto?: string;

  @Column({ type: 'varchar', length: 120, nullable: true }) email?: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefono?: string;
  @Column({ type: 'varchar', length: 250, nullable: true }) direccion?: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) ciudad?: string;

  @Column({ type: 'varchar', length: 30, default: OrigenProspecto.OTRO })
  origen!: OrigenProspecto;

  @Column({ type: 'uuid', nullable: true }) responsableId?: string;

  /** Cuando el prospecto compra, se convierte en cliente y se enlaza aquí. */
  @Column({ type: 'uuid', nullable: true }) clienteId?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true }) notas?: string;
  @Column({ default: true }) activo!: boolean;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/* ── Oportunidad ──────────────────────────────────────────────────────────── */

@Entity('crm_oportunidades')
@Index(['empresaId', 'etapaId'])
@Index(['empresaId', 'responsableId'])
export class Oportunidad {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 30 }) folio!: string;
  @Column({ type: 'varchar', length: 200 }) titulo!: string;
  @Column({ type: 'varchar', length: 1000, nullable: true })
  descripcion?: string;

  @ManyToOne(() => Prospecto, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'prospectoid' })
  prospecto?: Prospecto;
  @Column({ type: 'uuid', nullable: true }) prospectoId?: string;

  /** Alternativa al prospecto: oportunidad sobre un cliente que ya existe. */
  @Column({ type: 'uuid', nullable: true }) clienteId?: string;
  @Column({ type: 'varchar', length: 160, nullable: true })
  nombreContacto?: string;

  @ManyToOne(() => EtapaEmbudo, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'etapaid' })
  etapa!: EtapaEmbudo;
  @Column({ type: 'uuid' }) etapaId!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  importe!: number;
  @Column({ type: 'varchar', length: 3, default: 'MXN' }) moneda!: string;

  /** Se copia de la etapa al entrar, pero el vendedor puede ajustarla. */
  @Column({ type: 'int', default: 50 }) probabilidad!: number;

  @Column({ type: 'date', nullable: true }) fechaCierreEstimada?: Date;
  @Column({ type: 'date', nullable: true }) fechaCierreReal?: Date;

  @Column({ type: 'uuid', nullable: true }) responsableId?: string;
  @Column({ type: 'varchar', length: 160, nullable: true })
  nombreResponsable?: string;

  /** Fecha del último cambio de etapa: mide el estancamiento. */
  @Column({ type: 'timestamptz', nullable: true }) fechaUltimoMovimiento?: Date;

  @Column({ type: 'varchar', length: 400, nullable: true })
  motivoPerdida?: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) competidor?: string;

  /** Documento generado si la oportunidad se ganó (cotización o venta). */
  @Column({ type: 'uuid', nullable: true }) documentoId?: string;

  @OneToMany(() => Actividad, (a) => a.oportunidad)
  actividades!: Actividad[];

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/* ── Actividad ────────────────────────────────────────────────────────────── */

@Entity('crm_actividades')
@Index(['empresaId', 'fechaProgramada'])
@Index(['oportunidadId'])
export class Actividad {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @ManyToOne(() => Oportunidad, (o) => o.actividades, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'oportunidadid' })
  oportunidad?: Oportunidad;
  @Column({ type: 'uuid', nullable: true }) oportunidadId?: string;

  @Column({ type: 'uuid', nullable: true }) prospectoId?: string;

  @Column({ type: 'varchar', length: 30 }) tipo!: TipoActividad;
  @Column({ type: 'varchar', length: 200 }) asunto!: string;
  @Column({ type: 'varchar', length: 2000, nullable: true }) detalle?: string;

  @Column({ type: 'timestamptz' }) fechaProgramada!: Date;
  @Column({ type: 'timestamptz', nullable: true }) fechaRealizada?: Date;
  @Column({ type: 'int', default: 30 }) duracionMinutos!: number;

  @Column({ default: false }) completada!: boolean;
  @Column({ type: 'varchar', length: 1000, nullable: true }) resultado?: string;

  @Column({ type: 'uuid', nullable: true }) responsableId?: string;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/* ── Historial de etapas ──────────────────────────────────────────────────── */

/**
 * Cada movimiento entre etapas queda registrado. Sin esto no se puede medir
 * el tiempo de ciclo ni saber en qué etapa se atoran los negocios.
 */
@Entity('crm_historial_etapas')
@Index(['oportunidadId', 'fechaCambio'])
export class HistorialEtapa {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) oportunidadId!: string;

  @Column({ type: 'uuid', nullable: true })
  etapaAnteriorId?: string;
  @Column({ type: 'varchar', length: 80, nullable: true })
  nombreEtapaAnterior?: string;
  @Column({ type: 'uuid' }) etapaNuevaId!: string;
  @Column({ type: 'varchar', length: 80 }) nombreEtapaNueva!: string;

  /** Días que la oportunidad permaneció en la etapa anterior. */
  @Column({ type: 'int', default: 0 }) diasEnEtapaAnterior!: number;

  @Column({ type: 'uuid', nullable: true }) usuarioId?: string;
  @CreateDateColumn() fechaCambio!: Date;
}
