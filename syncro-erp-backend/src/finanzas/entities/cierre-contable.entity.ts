import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';

@Entity('cierres_contables')
export class CierreContable {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'int' })
  mes!: number;   // 1-12

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'uniqueidentifier' })
  usuarioId!: string;   // quién ejecutó el cierre

  @Column({ type: 'varchar', length: 500, nullable: true })
  notas!: string;

  @CreateDateColumn()
  fechaCierre!: Date;
}