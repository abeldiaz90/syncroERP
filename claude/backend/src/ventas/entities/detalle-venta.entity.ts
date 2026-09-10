import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// src/ventas/entities/detalle-venta.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Venta } from './venta.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

@Entity('detalles_venta')
export class DetalleVenta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Venta, (venta) => venta.detalles)
  @JoinColumn({ name: 'ventaid' })
  venta: Venta;

  @Column({ type: 'uuid' })
  ventaId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoid' })
  producto: Producto;

  @Column({ type: 'uuid' })
  productoId: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  cantidad: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidadDevuelta: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  precioUnitario: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  descuento: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 0 })
  impuestoPorcentaje: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2, default: 0 })
  impuestoMonto: number;
}
