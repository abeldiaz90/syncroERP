import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Empresa } from './empresa.entity';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Exclude } from 'class-transformer'; // ✅ IMPORTANTE

@Entity('Usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'nvarchar', length: 100 })
  nombreCompleto!: string;

  @Column({ type: 'nvarchar', length: 100, unique: true })
  email!: string;

  @Column({ type: 'nvarchar', length: 255 })
  @Exclude() // ✅ NUNCA DEVOLVERÁ EL HASH AL FRONTEND
  passwordHash!: string;

  @Column({ type: 'nvarchar', length: 20, default: 'empleado' })
  rol!: string;

  @Column({ type: 'bit', default: 1 })
  activo!: boolean;

  @ManyToOne(() => Empresa, (empresa) => empresa.usuarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresaId' })
  empresa!: Empresa;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: 'departamentoId' })
  departamento?: Departamento;

  @Column({ type: 'uniqueidentifier', nullable: true })
  departamentoId?: string;
}