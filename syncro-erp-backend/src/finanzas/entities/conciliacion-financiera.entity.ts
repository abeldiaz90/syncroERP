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

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'date' })
  fechaCorte!: Date;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: EstadoConciliacionFinanciera;

  /** Fotografía inmutable de mayor y auxiliares al iniciar la revisión. */
  @Column({ type: 'nvarchar', length: 'MAX' })
  snapshotJson!: string;

  /** Decisiones y justificaciones capturadas por área. */
  @Column({ type: 'nvarchar', length: 'MAX', default: '{}' })
  resolucionesJson!: string;

  @Column({ type: 'uniqueidentifier' })
  creadoPor!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  confirmadoPor!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaConfirmacion!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'datetime2' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  fechaActualizacion!: Date;
}
