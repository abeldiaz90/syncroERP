import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EstadoConciliacionFinanciera =
  | 'BORRADOR'
  | 'CON_DIFERENCIAS'
  | 'CONCILIADA';

@Entity('conciliaciones_financieras')
@Index(['empresaId', 'fechaCorte'])
export class ConciliacionFinanciera {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'date' })
  fechaCorte!: Date;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: EstadoConciliacionFinanciera;

  /** Fotografía inmutable de mayor y auxiliares al iniciar la revisión. */
  @Column({ type: 'text' })
  snapshotJson!: string;

  /** Decisiones y justificaciones capturadas por área. */
  @Column({ type: 'text', default: '{}' })
  resolucionesJson!: string;

  @Column({ type: 'uuid' })
  creadoPor!: string;

  @Column({ type: 'uuid', nullable: true })
  confirmadoPor!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaConfirmacion!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  fechaActualizacion!: Date;
}
