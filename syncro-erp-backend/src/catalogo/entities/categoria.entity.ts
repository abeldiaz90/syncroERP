import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';

@Entity('categorias')
@Unique(['empresaId', 'nombre']) 
export class Categoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion!: string;

  // ── JERARQUÍA ──
  @ManyToOne(() => Categoria, (categoria) => categoria.subcategorias, { nullable: true })
  @JoinColumn({ name: 'categoriaPadreId' })
  categoriaPadre!: Categoria;

  @Column({ type: 'uniqueidentifier', nullable: true })
  categoriaPadreId!: string;

  @OneToMany(() => Categoria, (categoria) => categoria.categoriaPadre)
  subcategorias!: Categoria[];

  // ── MOTOR CONTABLE ──
  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaVentasId' })
  cuentaVentas!: CuentaContable;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaVentasId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaCostoVentasId' })
  cuentaCostoVentas!: CuentaContable;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaCostoVentasId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaInventarioId' })
  cuentaInventario!: CuentaContable;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaInventarioId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaDevolucionesId' })
  cuentaDevoluciones!: CuentaContable;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaDevolucionesId!: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaMermasId' })
  cuentaMermas!: CuentaContable;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaMermasId!: string;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}