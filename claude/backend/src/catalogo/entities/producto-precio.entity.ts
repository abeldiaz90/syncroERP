import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Producto } from './producto.entity';
import { ListaPrecio } from './lista-precio.entity';

@Entity('productos_precios')
export class ProductoPrecio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, (prod) => prod.preciosProducto, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productoid' })
  producto!: Producto;

  @Column({ type: 'uuid' })
  productoId!: string;

  @ManyToOne(() => ListaPrecio, (lista) => lista.preciosProducto, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'listaprecioid' })
  listaPrecio!: ListaPrecio;

  @Column({ type: 'uuid' })
  listaPrecioId!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  precio!: number;
}
