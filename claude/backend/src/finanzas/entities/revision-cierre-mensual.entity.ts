import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EstadoRevisionCierre =
  | 'BORRADOR'
  | 'LISTO'
  | 'CERRADO'
  | 'INVALIDADO';

@Entity('revisiones_cierre_mensual')
@Index(['empresaId', 'anio', 'mes'])
export class RevisionCierreMensual {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'int' })
  mes!: number;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: EstadoRevisionCierre;

  /** Diagnóstico inmutable tomado al iniciar esta revisión. */
  @Column({ type: 'text' })
  snapshotJson!: string;

  /** Confirmaciones humanas separadas de los controles automáticos. */
  @Column({ type: 'text', default: '{}' })
  confirmacionesJson!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notas!: string | null;

  @Column({ type: 'uuid' })
  creadoPor!: string;

  @Column({ type: 'uuid', nullable: true })
  revisadoPor!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaRevision!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cierreId!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  fechaActualizacion!: Date;
}
