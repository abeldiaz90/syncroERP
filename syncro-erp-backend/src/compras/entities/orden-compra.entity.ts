import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Cotizacion } from './cotizacion.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { DetalleOrdenCompra } from './detalle-orden-compra.entity';

export type EstadoOC = 'PENDIENTE' | 'ENVIADA' | 'RECIBIDA' | 'CON_INCIDENCIAS' | 'CANCELADA';

@Entity('ordenes_compra')
export class OrdenCompra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  @ManyToOne(() => Cotizacion)
  @JoinColumn({ name: 'cotizacionId' })
  cotizacion: Cotizacion;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cotizacionId: string;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedorId' })
  proveedor: Proveedor;

  @Column({ type: 'uniqueidentifier' })
  proveedorId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoOC;

  @CreateDateColumn()
  fechaCreacion: Date;

  @OneToMany(() => DetalleOrdenCompra, (det) => det.ordenCompra, { cascade: true })
  detalles: DetalleOrdenCompra[];
}