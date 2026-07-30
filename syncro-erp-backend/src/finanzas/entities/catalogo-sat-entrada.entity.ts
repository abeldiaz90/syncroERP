import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CatalogoFiscalVersion } from './catalogo-fiscal-version.entity';

export enum TipoCatalogoSat {
  AGRUPADOR = 'AGRUPADOR',
  MONEDA = 'MONEDA',
  BANCO = 'BANCO',
  METODO_PAGO = 'METODO_PAGO',
}

@Entity('catalogos_sat_entradas')
@Index(['versionId', 'tipo', 'clave'], { unique: true })
@Index(['versionId', 'tipo', 'activo'])
export class CatalogoSatEntrada {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  versionId!: string;

  @ManyToOne(() => CatalogoFiscalVersion, (version) => version.entradas, {
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'versionId' })
  version!: CatalogoFiscalVersion;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TipoCatalogoSat;

  @Column({ type: 'varchar', length: 20 })
  clave!: string;

  @Column({ type: 'nvarchar', length: 1000 })
  nombre!: string;

  @Column({ type: 'int', nullable: true })
  nivel!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  clavePadre!: string | null;

  @Column({ type: 'bit', default: true })
  activo!: boolean;
}
