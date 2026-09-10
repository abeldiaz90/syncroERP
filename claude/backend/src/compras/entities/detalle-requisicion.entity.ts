import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Requisicion } from './requisicion.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

@Entity('detalles_requisicion')
export class DetalleRequisicion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Requisicion, (req) => req.detalles)
  @JoinColumn({ name: 'requisicionid' })
  requisicion: Requisicion;

  @Column({ type: 'uuid' })
  requisicionId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoid' })
  producto: Producto;

  @Column({ type: 'uuid' })
  productoId: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  cantidadSolicitada: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
