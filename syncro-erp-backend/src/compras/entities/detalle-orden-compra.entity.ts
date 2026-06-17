import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrdenCompra } from './orden-compra.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

@Entity('detalles_orden_compra')
export class DetalleOrdenCompra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrdenCompra, (oc) => oc.detalles)
  @JoinColumn({ name: 'ordenCompraId' })
  ordenCompra: OrdenCompra;

  @Column({ type: 'uniqueidentifier' })
  ordenCompraId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto: Producto;

  @Column({ type: 'uniqueidentifier' })
  productoId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cantidad: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precioUnitario: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;
  
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidadRecibidaOk: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidadRechazada: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motivoRechazo: string;
}