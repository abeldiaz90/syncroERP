import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';

@Entity('lotes_inventario')
export class LoteInventario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column({ type: 'uniqueidentifier' })
  productoId!: string;

  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacenId' })
  almacen!: Almacen;

  @Column({ type: 'uniqueidentifier' })
  almacenId!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  numeroLote!: string; // Ej. "LOTE-AGO-2026-A"

  // 👇 AQUÍ ESTÁ LA MAGIA: nullable: true y el signo de interrogación ? 👇
  @Column({ type: 'date', nullable: true })
  fechaCaducidad?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  stockRestante!: number;

  @Column({ default: true })
  activo!: boolean; // Podemos seguir usándolo para filtros rápidos

  @CreateDateColumn()
  fechaIngreso!: Date;
}