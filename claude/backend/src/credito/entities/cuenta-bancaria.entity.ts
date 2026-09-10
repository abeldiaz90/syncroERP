import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';
import { Banco } from '../../catalogo/entities/banco.entity';

export enum TipoCuentaBancaria {
  CAJA = 'CAJA',
  BANCO = 'BANCO',
  TPV = 'TPV',
}

@Entity('cuentas_bancarias')
@Index('UX_cuentas_bancarias_empresa_clabe', ['empresaId', 'clabe'], {
  unique: true,
  where: 'clabe IS NOT NULL',
})
export class CuentaBancaria {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'varchar', length: 100 }) nombre!: string;
  @Column({ type: 'varchar', length: 20 }) tipo!: TipoCuentaBancaria;
  @Column({ type: 'varchar', length: 50, nullable: true })
  numeroCuenta!: string | null;

  @ManyToOne(() => Banco, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'bancoid' })
  banco!: Banco | null;

  @Column({ type: 'uuid', nullable: true })
  bancoId!: string | null;

  /** CLABE de 18 dígitos de esta cuenta; no es un dato del catálogo Banco. */
  @Column({ type: 'varchar', length: 18, nullable: true })
  clabe!: string | null;
  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentacontableid' })
  cuentaContable!: CuentaContable | null;
  @Column({ type: 'uuid', nullable: true })
  cuentaContableId!: string | null;
  @Column({ default: false }) esPorDefecto!: boolean;
  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}
