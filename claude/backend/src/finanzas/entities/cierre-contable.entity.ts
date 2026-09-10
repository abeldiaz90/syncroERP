import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('cierres_contables')
@Index('UX_cierres_contables_empresa_periodo', ['empresaId', 'anio', 'mes'], {
  unique: true,
})
export class CierreContable {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'int' })
  mes!: number; // 1-12

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'uuid' })
  usuarioId!: string; // quién ejecutó el cierre

  @Column({ type: 'varchar', length: 500, nullable: true })
  notas!: string | null;

  @Column({ type: 'uuid', nullable: true })
  revisionId!: string | null;

  @CreateDateColumn()
  fechaCierre!: Date;
}
