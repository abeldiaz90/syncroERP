import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CuentaContable } from './cuenta-contable.entity';
import { CatalogoFiscalVersion } from './catalogo-fiscal-version.entity';
import { CatalogoSatEntrada } from './catalogo-sat-entrada.entity';

@Entity('cuentas_contables_sat_mapeos')
@Index(['empresaId', 'cuentaContableId', 'activo'])
export class CuentaContableSatMapeo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'uniqueidentifier' })
  cuentaContableId!: string;

  @ManyToOne(() => CuentaContable, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cuentaContableId' })
  cuentaContable!: CuentaContable;

  @Column({ type: 'uniqueidentifier' })
  versionId!: string;

  @ManyToOne(() => CatalogoFiscalVersion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'versionId' })
  version!: CatalogoFiscalVersion;

  @Column({ type: 'uniqueidentifier' })
  entradaId!: string;

  @ManyToOne(() => CatalogoSatEntrada, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'entradaId' })
  entrada!: CatalogoSatEntrada;

  @Column({ type: 'date' })
  vigenciaDesde!: Date;

  @Column({ type: 'date', nullable: true })
  vigenciaHasta!: Date | null;

  @Column({ type: 'bit', default: true })
  activo!: boolean;

  @Column({ type: 'bit', default: false })
  sugeridoPorSistema!: boolean;

  @Column({ type: 'bit', default: false })
  confirmado!: boolean;

  @Column({ type: 'uniqueidentifier', nullable: true })
  confirmadoPorId!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaConfirmacion!: Date | null;

  @CreateDateColumn()
  fechaCreacion!: Date;
}
