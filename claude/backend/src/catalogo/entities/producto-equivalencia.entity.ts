import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Producto } from './producto.entity';

@Entity('productos_equivalencias')
export class ProductoEquivalencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, (prod) => prod.equivalencias, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productoid' })
  producto!: Producto;

  @Column({ type: 'uuid' })
  productoId!: string;

  @Column({ type: 'varchar', length: 50 })
  nombreEmpaque!: string; // Ej. "Paquete", "Caja"

  // Jerarquía: puede apuntar a otra equivalencia o ser nula (unidad base del producto)
  @ManyToOne(() => ProductoEquivalencia, { nullable: true })
  @JoinColumn({ name: 'equivalenciabaseid' })
  equivalenciaBase?: ProductoEquivalencia | null;

  @Column({ type: 'uuid', nullable: true })
  equivalenciaBaseId?: string | null;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 4 })
  factorConversion!: number; // Cantidad de unidades de la "base" que contiene

  @Column({ type: 'varchar', length: 50, nullable: true })
  codigoBarras!: string;
}
