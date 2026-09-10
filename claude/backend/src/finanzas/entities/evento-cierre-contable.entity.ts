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

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'int' })
  mes!: number;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'varchar', length: 20 })
  tipo!: 'CIERRE' | 'REAPERTURA';

  @Column({ type: 'uuid' })
  usuarioId!: string;

  @Column({ type: 'uuid', nullable: true })
  cierreId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  revisionId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motivo!: string | null;

  /** Evidencia del momento exacto en que ocurrió el evento. */
  @Column({ type: 'text' })
  evidenciaJson!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaEvento!: Date;
}
