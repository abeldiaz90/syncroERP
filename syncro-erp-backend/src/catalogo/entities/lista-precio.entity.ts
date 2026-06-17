import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { ProductoPrecio } from './producto-precio.entity';

@Entity('listas_precio')
export class ListaPrecio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ default: false })
  esPorDefecto!: boolean;

  @OneToMany(() => ProductoPrecio, (pp) => pp.listaPrecio)
  preciosProducto: ProductoPrecio[];
}