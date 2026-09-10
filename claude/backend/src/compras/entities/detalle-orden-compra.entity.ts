import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
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
  @JoinColumn({ name: 'ordencompraid' })
  ordenCompra: OrdenCompra;

  @Column({ type: 'uuid' })
  ordenCompraId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoid' })
  producto: Producto;

  @Column({ type: 'uuid' })
  productoId: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  cantidad: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  precioUnitario: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  cantidadRecibidaOk: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  cantidadRechazada: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motivoRechazo: string;
}
