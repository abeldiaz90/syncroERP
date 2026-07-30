import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CatalogoSatEntrada } from './catalogo-sat-entrada.entity';

@Entity('catalogos_fiscales_versiones')
@Index(['clave'], { unique: true })
export class CatalogoFiscalVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  clave!: string;

  @Column({ type: 'varchar', length: 5 })
  jurisdiccion!: string;

  @Column({ type: 'varchar', length: 30 })
  autoridad!: string;

  @Column({ type: 'varchar', length: 160 })
  nombre!: string;

  @Column({ type: 'int' })
  ejercicio!: number;

  @Column({ type: 'date' })
  fechaPublicacion!: Date;

  @Column({ type: 'date' })
  vigenciaDesde!: Date;

  @Column({ type: 'date', nullable: true })
  vigenciaHasta!: Date | null;

  @Column({ type: 'varchar', length: 500 })
  fuenteUrl!: string;

  @Column({ type: 'char', length: 64 })
  sha256!: string;

  @Column({ type: 'varchar', length: 20, default: 'VIGENTE' })
  estado!: 'VIGENTE' | 'HISTORICO' | 'BORRADOR';

  @OneToMany(() => CatalogoSatEntrada, (entrada) => entrada.version)
  entradas!: CatalogoSatEntrada[];

  @CreateDateColumn()
  fechaCreacion!: Date;
}
