import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
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

export type EstadoOC =
  | 'PENDIENTE'
  | 'ENVIADA'
  | 'RECIBIDA'
  | 'CON_INCIDENCIAS'
  | 'PARCIALMENTE_PAGADA'
  | 'PAGADA'
  | 'CANCELADA';

@Entity('ordenes_compra')
export class OrdenCompra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Cotizacion)
  @JoinColumn({ name: 'cotizacionid' })
  cotizacion: Cotizacion;

  @Column({ type: 'uuid', nullable: true })
  cotizacionId: string;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedorid' })
  proveedor: Proveedor;

  @Column({ type: 'uuid' })
  proveedorId: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  totalPagado: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  saldoPendiente: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoOC;

  @CreateDateColumn()
  fechaCreacion: Date;

  @OneToMany(() => DetalleOrdenCompra, (det) => det.ordenCompra, {
    cascade: true,
  })
  detalles: DetalleOrdenCompra[];
}
