import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Usuario } from '../../iam/entities/usuario.entity';

@Entity('configuraciones_aprobacion')
export class ConfiguracionAprobacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  @ManyToOne(() => Departamento)
  @JoinColumn({ name: 'departamentoId' })
  departamento: Departamento;

  @Column({ type: 'uniqueidentifier' })
  departamentoId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuarioId' })
  usuario: Usuario;

  @Column({ type: 'uniqueidentifier' })
  usuarioId: string;

  @Column({ type: 'int' })
  orden: number;
}