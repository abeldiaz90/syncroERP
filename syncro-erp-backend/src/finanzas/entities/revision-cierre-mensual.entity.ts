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

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'int' })
  mes!: number;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: EstadoRevisionCierre;

  /** Diagnóstico inmutable tomado al iniciar esta revisión. */
  @Column({ type: 'nvarchar', length: 'MAX' })
  snapshotJson!: string;

  /** Confirmaciones humanas separadas de los controles automáticos. */
  @Column({ type: 'nvarchar', length: 'MAX', default: '{}' })
  confirmacionesJson!: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  notas!: string | null;

  @Column({ type: 'uniqueidentifier' })
  creadoPor!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  revisadoPor!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaRevision!: Date | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cierreId!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'datetime2' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  fechaActualizacion!: Date;
}
