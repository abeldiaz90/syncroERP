// src/compras/entities/cotizacion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Requisicion } from './requisicion.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { DetalleCotizacion } from './detalle-cotizacion.entity';
import { OrdenCompra } from './orden-compra.entity'; // ← Import necesario para la nueva relación

export type EstadoCotizacion = 'PENDIENTE' | 'SELECCIONADA' | 'RECHAZADA';

@Entity('cotizaciones')
export class Cotizacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  @ManyToOne(() => Requisicion, (req) => req.cotizaciones)
  @JoinColumn({ name: 'requisicionId' })
  requisicion: Requisicion;

  @Column({ type: 'uniqueidentifier' })
  requisicionId: string;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedorId' })
  proveedor: Proveedor;

  @Column({ type: 'uniqueidentifier' })
  proveedorId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  impuestoTotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoCotizacion;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  fechaCotizacion: Date;

  @OneToMany(() => DetalleCotizacion, (det) => det.cotizacion, { cascade: true })
  detalles: DetalleCotizacion[];

  @OneToMany(() => OrdenCompra, (oc) => oc.cotizacion)
  ordenesCompra: OrdenCompra[];
}