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

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  cuentaContableId!: string;

  @ManyToOne(() => CuentaContable, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cuentacontableid' })
  cuentaContable!: CuentaContable;

  @Column({ type: 'uuid' })
  versionId!: string;

  @ManyToOne(() => CatalogoFiscalVersion, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'versionid' })
  version!: CatalogoFiscalVersion;

  @Column({ type: 'uuid' })
  entradaId!: string;

  @ManyToOne(() => CatalogoSatEntrada, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'entradaid' })
  entrada!: CatalogoSatEntrada;

  @Column({ type: 'date' })
  vigenciaDesde!: Date;

  @Column({ type: 'date', nullable: true })
  vigenciaHasta!: Date | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'boolean', default: false })
  sugeridoPorSistema!: boolean;

  @Column({ type: 'boolean', default: false })
  confirmado!: boolean;

  @Column({ type: 'uuid', nullable: true })
  confirmadoPorId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaConfirmacion!: Date | null;

  @CreateDateColumn()
  fechaCreacion!: Date;
}
