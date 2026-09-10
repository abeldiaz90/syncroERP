import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';

@Entity('categorias')
@Unique(['empresaId', 'nombre'])
export class Categoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion!: string;

  // ── JERARQUÍA ──
  @ManyToOne(() => Categoria, (categoria) => categoria.subcategorias, {
    nullable: true,
  })
  @JoinColumn({ name: 'categoriapadreid' })
  categoriaPadre!: Categoria;

  @Column({ type: 'uuid', nullable: true })
  categoriaPadreId!: string;

  @OneToMany(() => Categoria, (categoria) => categoria.categoriaPadre)
  subcategorias!: Categoria[];

  // ── MOTOR CONTABLE ──
  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaventasid' })
  cuentaVentas!: CuentaContable;

  @Column({ type: 'uuid', nullable: true })
  cuentaVentasId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentacostoventasid' })
  cuentaCostoVentas!: CuentaContable;

  @Column({ type: 'uuid', nullable: true })
  cuentaCostoVentasId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentainventarioid' })
  cuentaInventario!: CuentaContable;

  @Column({ type: 'uuid', nullable: true })
  cuentaInventarioId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentadevolucionesid' })
  cuentaDevoluciones!: CuentaContable;

  @Column({ type: 'uuid', nullable: true })
  cuentaDevolucionesId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentamermasid' })
  cuentaMermas!: CuentaContable;

  @Column({ type: 'uuid', nullable: true })
  cuentaMermasId!: string;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
