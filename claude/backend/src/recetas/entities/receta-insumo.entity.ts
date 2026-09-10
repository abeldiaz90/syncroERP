import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// recetas/entities/receta-insumo.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Receta } from './receta.entity';

// Cada línea de una receta: un insumo (producto del catálogo) y cuánto
// lleva. Ej: Margarita → 50 ml de Tequila.
@Entity('recetas_insumos')
@Index(
  'UX_recetas_insumos_receta_insumo',
  ['empresaId', 'recetaId', 'insumoId'],
  {
    unique: true,
  },
)
export class RecetaInsumo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => Receta, (r) => r.insumos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recetaid' })
  receta!: Receta;

  @Column({ type: 'uuid' })
  recetaId!: string;

  // El insumo/ingrediente (producto del catálogo: tequila, queso, pan)
  @Column({ type: 'uuid' })
  insumoId!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  insumoNombre!: string | null; // cache

  // Cuánto lleva de este insumo por unidad de producto producido
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4 })
  cantidad!: number;

  // Unidad de la cantidad (ml, g, pza, oz). Idealmente coincide con la
  // unidad de inventario del insumo para descontar directo.
  @Column({ type: 'varchar', length: 20, default: 'PIEZA' })
  unidad!: string;

  // Merma esperada (%), estándar en la industria. Ej: 5% de desperdicio.
  // El descuento real de inventario considera la merma:
  //   cantidadReal = cantidad * (1 + merma/100)
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 })
  mermaPorcentaje!: number;

  // Costo unitario del insumo al momento (cache para calcular costo teórico)
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  costoUnitario!: number;
}
