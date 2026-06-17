import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Usuario } from './usuario.entity';

@Entity('Empresas')
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 100 })
  nombreComercial!: string;

  @Column({ type: 'nvarchar', length: 15, nullable: true })
  rfc!: string;

  @CreateDateColumn()
  fechaRegistro!: Date;

  // Relación: Una empresa tiene muchos usuarios
  @OneToMany(() => Usuario, (usuario) => usuario.empresa)
  usuarios!: Usuario[];
}