// recetas/entities/receta.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { RecetaInsumo } from './receta-insumo.entity';

// Una Receta (escandallo) define de qué insumos se compone un producto
// vendible de tipo KIT (margarita, hamburguesa) y en qué cantidades.
// Al vender/producir ese producto, se explota la receta y se descuentan
// los insumos del inventario.
@Entity('recetas')
export class Receta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  // Producto vendible al que pertenece esta receta (tipo KIT en el catálogo)
  @Column({ type: 'uniqueidentifier' })
  productoId!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  productoNombre!: string | null; // cache para mostrar

  // Cuántas porciones/unidades produce esta receta (normalmente 1).
  // Ej: una receta de salsa puede rendir 10 porciones.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  rendimiento!: number;

  // Costo teórico calculado (suma del costo de sus insumos). Se recalcula
  // cuando cambian los insumos o sus precios de compra.
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  costoTeorico!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notas!: string | null; // preparación, instrucciones

  @Column({ default: true })
  activa!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @OneToMany(() => RecetaInsumo, (ri) => ri.receta, { cascade: true })
  insumos!: RecetaInsumo[];
}
