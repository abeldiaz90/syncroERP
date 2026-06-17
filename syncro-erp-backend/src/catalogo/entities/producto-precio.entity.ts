import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Producto } from './producto.entity';
import { ListaPrecio } from './lista-precio.entity';

@Entity('productos_precios')
export class ProductoPrecio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto, (prod) => prod.preciosProducto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column({ type: 'uniqueidentifier' })
  productoId!: string;

  @ManyToOne(() => ListaPrecio, (lista) => lista.preciosProducto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listaPrecioId' })
  listaPrecio!: ListaPrecio;

  @Column({ type: 'uniqueidentifier' })
  listaPrecioId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  precio!: number;
}