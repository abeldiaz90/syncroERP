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
import { Almacen } from '../../catalogo/entities/almacen.entity';
import { ListaPrecio } from '../../catalogo/entities/lista-precio.entity';

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
  /*
   * ──────────────────────────────────────────────────────────────────────────
   * El contexto de venta de una caja
   * --------------------------------------------------------------------------
   * De qué almacén sale la mercancía que se cobra por esta caja, y con qué
   * lista de precios se cobra. Se configura UNA VEZ, por quien administra las
   * cuentas, y el punto de venta lo obedece.
   *
   * Antes lo elegía quien vendía, en dos desplegables de la cabecera del punto
   * de venta. Eso permitía rebajar cualquier venta cambiando de lista —sin que
   * quedara registrado un solo descuento— y descuadrar el inventario de una
   * bodega ajena cambiando de almacén. Las dos cosas salen «bien» en el
   * ticket, y por eso ninguna se descubre auditando ventas.
   *
   * La caja es el lugar natural del amarre: el punto de venta YA obliga a
   * elegir caja en todo cobro de contado, así que elegir dónde entra el dinero
   * ya determina el mostrador desde el que se está vendiendo.
   *
   * Nulos a propósito: una cuenta de BANCO no tiene almacén, y una caja que
   * todavía no se configuró sigue funcionando con el predeterminado de la
   * empresa, que es lo que ya se venía usando. Configurarlo es una mejora, no
   * un requisito para cobrar.
   * ──────────────────────────────────────────────────────────────────────────
   */
  @ManyToOne(() => Almacen, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'almacenid' })
  almacen!: Almacen | null;

  @Column({ type: 'uuid', nullable: true })
  almacenId!: string | null;

  @ManyToOne(() => ListaPrecio, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'listaprecioid' })
  listaPrecio!: ListaPrecio | null;

  @Column({ type: 'uuid', nullable: true })
  listaPrecioId!: string | null;

  @Column({ default: false }) esPorDefecto!: boolean;
  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}
