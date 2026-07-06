import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';

export enum TipoCuentaBancaria {
  CAJA = 'CAJA',
  BANCO = 'BANCO',
  TPV = 'TPV',
}

@Entity('cuentas_bancarias')
export class CuentaBancaria {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @Column({ type: 'varchar', length: 100 }) nombre!: string;
  @Column({ type: 'varchar', length: 20 }) tipo!: TipoCuentaBancaria;
  @Column({ type: 'varchar', length: 50, nullable: true }) numeroCuenta!: string;
  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaContableId' }) cuentaContable!: CuentaContable;
  @Column({ type: 'uniqueidentifier', nullable: true }) cuentaContableId!: string;
  @Column({ default: false }) esPorDefecto!: boolean;
  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}