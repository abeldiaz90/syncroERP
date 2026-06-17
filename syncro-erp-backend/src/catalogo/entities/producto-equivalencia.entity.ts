import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Producto } from './producto.entity';

@Entity('productos_equivalencias')
export class ProductoEquivalencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, (prod) => prod.equivalencias, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column({ type: 'uniqueidentifier' })
  productoId!: string;

  @Column({ type: 'varchar', length: 50 })
  nombreEmpaque!: string; // Ej. "Paquete", "Caja"

  // Jerarquía: puede apuntar a otra equivalencia o ser nula (unidad base del producto)
  @ManyToOne(() => ProductoEquivalencia, { nullable: true })
  @JoinColumn({ name: 'equivalenciaBaseId' })
  equivalenciaBase?: ProductoEquivalencia | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  equivalenciaBaseId?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  factorConversion!: number; // Cantidad de unidades de la "base" que contiene

  @Column({ type: 'varchar', length: 50, nullable: true })
  codigoBarras!: string;
}