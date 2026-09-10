import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne,
  OneToMany, JoinColumn, Index,
} from 'typeorm';
import { Requisicion } from './requisicion.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { DetalleCotizacion } from './detalle-cotizacion.entity';
import { OrdenCompra } from './orden-compra.entity';
import { Usuario } from '../../iam/entities/usuario.entity';

export type EstadoCotizacion =
  | 'PENDIENTE'
  | 'PENDIENTE_APROBACION'
  | 'APROBADA'
  | 'SELECCIONADA'
  | 'RECHAZADA';

@Entity('cotizaciones')
@Index('UQ_cotizacion_requisicion_proveedor', ['empresaId', 'requisicionId', 'proveedorId'], { unique: true })
export class Cotizacion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) empresaId: string;

  @ManyToOne(() => Requisicion, (req) => req.cotizaciones)
  @JoinColumn({ name: 'requisicionid' }) requisicion: Requisicion;
  @Column({ type: 'uuid' }) requisicionId: string;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedorid' }) proveedor: Proveedor;
  @Column({ type: 'uuid' }) proveedorId: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) subtotal: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) impuestoTotal: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) total: number;
  @Column({ type: 'varchar', length: 30, default: 'PENDIENTE' }) estado: EstadoCotizacion;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ type: 'text', nullable: true }) motivoSeleccion?: string | null;
  @Column({ type: 'text', nullable: true }) comentarioAprobacion?: string | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'solicitadoaprobacionporid' }) solicitadoAprobacionPor?: Usuario;
  @Column({ type: 'uuid', nullable: true }) solicitadoAprobacionPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaSolicitudAprobacion?: Date;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'aprobadoporid' }) aprobadoPor?: Usuario;
  @Column({ type: 'uuid', nullable: true }) aprobadoPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaAprobacion?: Date;

  @CreateDateColumn() fechaCotizacion: Date;
  @OneToMany(() => DetalleCotizacion, (det) => det.cotizacion, { cascade: true }) detalles: DetalleCotizacion[];
  @OneToMany(() => OrdenCompra, (oc) => oc.cotizacion) ordenesCompra: OrdenCompra[];
}
