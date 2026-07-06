import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique, ManyToOne, JoinColumn, OneToMany } from 'typeorm';

export enum NaturalezaCuenta {
  DEUDORA = 'DEUDORA',
  ACREEDORA = 'ACREEDORA',
}

export enum TipoCuenta {
  ACTIVO = 'ACTIVO',
  PASIVO = 'PASIVO',
  CAPITAL = 'CAPITAL',
  INGRESO = 'INGRESO',
  COSTO = 'COSTO',
  GASTO = 'GASTO',
}

@Entity('cuentas_contables')
@Unique(['empresaId', 'numeroCuenta'])
export class CuentaContable {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 50 })
  numeroCuenta!: string;

  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  codigoAgrupadorSAT!: string;

  @Column({ type: 'varchar', length: 20, default: NaturalezaCuenta.DEUDORA })
  naturaleza!: NaturalezaCuenta;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoCuenta;

  @ManyToOne(() => CuentaContable, (cuenta) => cuenta.subcuentas, { nullable: true })
  @JoinColumn({ name: 'cuentaPadreId' })
  cuentaPadre!: CuentaContable;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaPadreId!: string;

  @OneToMany(() => CuentaContable, (cuenta) => cuenta.cuentaPadre)
  subcuentas!: CuentaContable[];

  @Column({ default: false })
  esAfectable!: boolean; // true = Cuenta de detalle (recibe pólizas), false = Cuenta de Mayor

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}