// src/catalogo/entities/estado.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Pais } from './pais.entity';

@Entity('estados')
export class Estado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @ManyToOne(() => Pais, { nullable: true })
  @JoinColumn({ name: 'paisId' })
  pais: Pais;

  @Column({ type: 'uniqueidentifier', nullable: true })
  paisId: string;

  @Column({ default: true })
  activo: boolean;
}