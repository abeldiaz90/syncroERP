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
  @JoinColumn({ name: 'cotizacionId' })
  cotizacion: Cotizacion;

  @Column({ type: 'uniqueidentifier' })
  cotizacionId: string;

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
}