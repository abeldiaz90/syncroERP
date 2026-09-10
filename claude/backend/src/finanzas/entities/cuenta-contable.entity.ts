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
  INGRESOS_HOSPEDAJE = 'INGRESOS_HOSPEDAJE',
  IMPUESTO_HOSPEDAJE_POR_PAGAR = 'IMPUESTO_HOSPEDAJE_POR_PAGAR',
  /** Utilidad en venta de activo fijo y otros ingresos no operativos. */
  OTROS_INGRESOS = 'OTROS_INGRESOS',
  /** Pérdida en baja de activo fijo y otros gastos no operativos. */
  OTROS_GASTOS = 'OTROS_GASTOS',
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

  @Column({ type: 'uuid' })
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
  @JoinColumn({ name: 'cuentapadreid' })
  cuentaPadre!: CuentaContable;

  @Column({ type: 'uuid', nullable: true })
  cuentaPadreId!: string;

  @OneToMany(() => CuentaContable, (cuenta) => cuenta.cuentaPadre)
  subcuentas!: CuentaContable[];

  @Column({ default: false })
  esAfectable!: boolean; // true = Cuenta de detalle (recibe pólizas), false = Cuenta de Mayor

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'varchar', length: 40, nullable: true })
  rolSistema!: RolCuentaSistema | null;

  /**
   * Si es false, la cuenta sólo puede moverse desde el módulo que la controla.
   *
   * `crearPolizaManual` validaba cuadre, valor distinto de cero y período
   * abierto, pero NO a qué cuentas se afectaba. Cualquiera con acceso a
   * Finanzas podía cargar o abonar a mano Bancos, Clientes CxC o Inventario:
   * el auxiliar no cambiaba, el mayor sí, y la conciliación cuadraba. Es el
   * mecanismo con el que se disimula un faltante.
   *
   * Regla estándar: las cuentas controladas por auxiliar se mueven desde su
   * módulo. El valor se deriva de `rolSistema` en `CuentasContablesService`.
   */
  @Column({ default: true })
  permiteMovimientoManual!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
