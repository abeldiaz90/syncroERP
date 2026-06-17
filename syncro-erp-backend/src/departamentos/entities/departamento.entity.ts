import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Usuario } from '../../iam/entities/usuario.entity';

@Entity('departamentos')
export class Departamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ default: true })
  activo: boolean;

  @OneToMany(() => Usuario, (user) => user.departamento)
  usuarios: Usuario[];
}