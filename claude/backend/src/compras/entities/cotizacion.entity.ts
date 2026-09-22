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
  | 'RECHAZADA'
  /*
   * Perdió la adjudicación. No es lo mismo que RECHAZADA y la diferencia
   * importa: a una propuesta rechazada alguien le dijo que no, con motivo y
   * con nombre; una descartada simplemente no fue la elegida. Confundirlas
   * deja al proveedor marcado como reprobado cuando sólo cotizó más caro, y
   * es la primera pregunta que se hace cuando alguien audita por qué se
   * adjudicó a otro.
   */
  | 'DESCARTADA';

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

  /*
   * `persistence: false` en las dos relaciones de auditoría: son de SÓLO
   * LECTURA. Comparten columna física con su `*Id`, y cuando la relación viene
   * cargada TypeORM escribe la llave desde el OBJETO y pisa el id que el
   * servicio acaba de asignar. Así quedó una adjudicación registrada a nombre
   * de quien la había rechazado en la vuelta anterior, no de quien la aprobó.
   * Con esto, la llave se escribe siempre desde `aprobadoPorId` /
   * `solicitadoAprobacionPorId`, y la relación sólo sirve para leer el nombre.
   */
  @ManyToOne(() => Usuario, { nullable: true, persistence: false })
  @JoinColumn({ name: 'solicitadoaprobacionporid' }) solicitadoAprobacionPor?: Usuario;
  @Column({ type: 'uuid', nullable: true }) solicitadoAprobacionPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaSolicitudAprobacion?: Date;

  @ManyToOne(() => Usuario, { nullable: true, persistence: false })
  @JoinColumn({ name: 'aprobadoporid' }) aprobadoPor?: Usuario;
  @Column({ type: 'uuid', nullable: true }) aprobadoPorId?: string;
  @Column({ type: 'timestamptz', nullable: true }) fechaAprobacion?: Date;

  @CreateDateColumn() fechaCotizacion: Date;
  @OneToMany(() => DetalleCotizacion, (det) => det.cotizacion, { cascade: true }) detalles: DetalleCotizacion[];
  @OneToMany(() => OrdenCompra, (oc) => oc.cotizacion) ordenesCompra: OrdenCompra[];
}
