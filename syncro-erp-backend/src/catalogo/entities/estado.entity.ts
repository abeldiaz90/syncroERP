// src/catalogo/entities/estado.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Pais } from './pais.entity';

@Entity('estados')
@Index('UX_estados_pais_codigo', ['paisId', 'codigo'], {
  unique: true,
  where: 'paisId IS NOT NULL AND codigo IS NOT NULL',
})
export class Estado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  codigo?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tipo?: string | null;

  @ManyToOne(() => Pais, { nullable: true })
  @JoinColumn({ name: 'paisId' })
  pais: Pais;

  @Column({ type: 'uniqueidentifier', nullable: true })
  paisId: string;

  @Column({ default: false })
  esOficial: boolean;

  @Column({ default: true })
  activo: boolean;
}
