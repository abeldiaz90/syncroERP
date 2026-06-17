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
  @JoinColumn({ name: 'requisicionId' })
  requisicion: Requisicion;

  @Column({ type: 'uniqueidentifier' })
  requisicionId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoId' })
  producto: Producto;

  @Column({ type: 'uniqueidentifier' })
  productoId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cantidadSolicitada: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}