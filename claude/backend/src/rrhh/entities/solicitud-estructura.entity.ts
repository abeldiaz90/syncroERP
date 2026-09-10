import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export enum TipoSolicitudEstructura {
  AREA = 'AREA',
  PUESTO = 'PUESTO',
}

export enum EstadoSolicitudEstructura {
  PENDIENTE_GERENCIA = 'PENDIENTE_GERENCIA',
  PENDIENTE_FINANZAS = 'PENDIENTE_FINANZAS',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CANCELADA = 'CANCELADA',
}

@Entity('rrhh_solicitudes_estructura')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'tipo', 'nombreSolicitado'])
export class SolicitudEstructura {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'varchar', length: 20 }) tipo!: TipoSolicitudEstructura;
  @Column({ type: 'varchar', length: 120 }) nombreSolicitado!: string;
  @Column({ type: 'text' }) datosJson!: string;
  @Column({ type: 'varchar', length: 500 }) motivo!: string;
  @Column({ type: 'varchar', length: 30, default: EstadoSolicitudEstructura.PENDIENTE_GERENCIA })
  estado!: EstadoSolicitudEstructura;

  @Column({ type: 'uuid' }) solicitadoPorId!: string;
  @Column({ type: 'uuid', nullable: true }) aprobadoGerenciaPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaAprobacionGerencia?: Date;
  @Column({ type: 'uuid', nullable: true }) aprobadoFinanzasPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaAprobacionFinanzas?: Date;
  @Column({ type: 'uuid', nullable: true }) rechazadoPorId?: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) comentarioResolucion?: string;
  @Column({ type: 'uuid', nullable: true }) entidadCreadaId?: string;

  @VersionColumn() version!: number;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
