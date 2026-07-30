import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('eventos_cierre_contable')
@Index(['empresaId', 'anio', 'mes'])
export class EventoCierreContable {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'int' })
  mes!: number;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'varchar', length: 20 })
  tipo!: 'CIERRE' | 'REAPERTURA';

  @Column({ type: 'uniqueidentifier' })
  usuarioId!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cierreId!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  revisionId!: string | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motivo!: string | null;

  /** Evidencia del momento exacto en que ocurrió el evento. */
  @Column({ type: 'nvarchar', length: 'MAX' })
  evidenciaJson!: string;

  @CreateDateColumn({ type: 'datetime2' })
  fechaEvento!: Date;
}
