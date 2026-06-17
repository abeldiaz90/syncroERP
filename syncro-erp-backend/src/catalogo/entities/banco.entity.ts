import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('bancos')
export class Banco {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}