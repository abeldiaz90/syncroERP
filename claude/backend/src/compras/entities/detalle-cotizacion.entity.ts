import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// src/compras/entities/detalle-cotizacion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Cotizacion } from './cotizacion.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

@Entity('detalles_cotizacion')
export class DetalleCotizacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cotizacion, (cot) => cot.detalles)
  @JoinColumn({ name: 'cotizacionid' })
  cotizacion: Cotizacion;

  @Column({ type: 'uuid' })
  cotizacionId: string;

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
}
