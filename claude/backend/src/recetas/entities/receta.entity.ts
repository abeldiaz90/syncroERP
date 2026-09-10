import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// recetas/entities/receta.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { RecetaInsumo } from './receta-insumo.entity';

// Una Receta (escandallo) define de qué insumos se compone un producto
// vendible de tipo KIT (margarita, hamburguesa) y en qué cantidades.
// Al vender/producir ese producto, se explota la receta y se descuentan
// los insumos del inventario.
@Entity('recetas')
@Index('UX_recetas_empresa_producto', ['empresaId', 'productoId'], {
  unique: true,
})
export class Receta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  // Producto vendible al que pertenece esta receta (tipo KIT en el catálogo)
  @Column({ type: 'uuid' })
  productoId!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  productoNombre!: string | null; // cache para mostrar

  // Cuántas porciones/unidades produce esta receta (normalmente 1).
  // Ej: una receta de salsa puede rendir 10 porciones.
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 1 })
  rendimiento!: number;

  // Costo teórico calculado (suma del costo de sus insumos). Se recalcula
  // cuando cambian los insumos o sus precios de compra.
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
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
