import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Producto } from './producto.entity';

@Entity('imagenes_producto')
export class ImagenProducto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  productoId: string;

  @ManyToOne(() => Producto, (producto) => producto.imagenes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productoid' })
  producto: Producto;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'int', default: 0 })
  orden: number;

  @Column({ type: 'boolean', default: false })
  principal: boolean;

  @CreateDateColumn()
  fechaCarga: Date;
}
