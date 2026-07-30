import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';

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
  /** Cuentas memorándum: no forman parte del balance ni del resultado. */
  ORDEN = 'ORDEN',
}

/**
 * Función operativa de una cuenta dentro del motor contable.
 *
 * El número de cuenta lo decide cada empresa; el motor no debe inferir su uso
 * por prefijos como 14xx o 21xx.
 */
export enum RolCuentaSistema {
  CAJA = 'CAJA',
  BANCOS = 'BANCOS',
  INVENTARIO = 'INVENTARIO',
  PROVEEDORES = 'PROVEEDORES',
  IVA_TRASLADADO_COBRADO = 'IVA_TRASLADADO_COBRADO',
  IVA_TRASLADADO_NO_COBRADO = 'IVA_TRASLADADO_NO_COBRADO',
  VENTAS = 'VENTAS',
  COSTO_VENTAS = 'COSTO_VENTAS',
  MERMAS = 'MERMAS',
  CLIENTES_CXC = 'CLIENTES_CXC',
  IVA_ACREDITABLE_PAGADO = 'IVA_ACREDITABLE_PAGADO',
  IVA_ACREDITABLE_PENDIENTE = 'IVA_ACREDITABLE_PENDIENTE',
  /** Alias de código para módulos anteriores; persiste el rol preciso. */
  IVA_TRASLADADO = 'IVA_TRASLADADO_COBRADO',
  /** Alias de código para módulos anteriores; persiste el rol preciso. */
  IVA_ACREDITABLE = 'IVA_ACREDITABLE_PAGADO',
  INTERESES = 'INTERESES',
  SALDOS_FAVOR_CLIENTES = 'SALDOS_FAVOR_CLIENTES',
  SALDOS_INICIALES = 'SALDOS_INICIALES',
}

@Entity('cuentas_contables')
@Unique(['empresaId', 'numeroCuenta'])
@Index('UX_cuentas_contables_empresa_rol', ['empresaId', 'rolSistema'], {
  unique: true,
  where: 'rolSistema IS NOT NULL',
})
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

  @ManyToOne(() => CuentaContable, (cuenta) => cuenta.subcuentas, {
    nullable: true,
  })
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

  @Column({ type: 'varchar', length: 40, nullable: true })
  rolSistema!: RolCuentaSistema | null;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
