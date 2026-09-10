import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TransferenciaInventario } from './transferencia-inventario.entity';
import { Producto } from './producto.entity';
import { UbicacionAlmacen } from './ubicacion-almacen.entity';

@Entity('transferencias_inventario_detalle')
@Index(['transferenciaId', 'productoId'])
export class TransferenciaInventarioDetalle {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) transferenciaId!: string;
  @ManyToOne(() => TransferenciaInventario, t => t.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transferenciaid' }) transferencia!: TransferenciaInventario;
  @Column({ type: 'uuid' }) productoId!: string;
  @ManyToOne(() => Producto) @JoinColumn({ name: 'productoid' }) producto!: Producto;
  @Column({ type: 'uuid', nullable: true }) ubicacionOrigenId?: string;
  @ManyToOne(() => UbicacionAlmacen, { nullable: true }) @JoinColumn({ name: 'ubicacionorigenid' }) ubicacionOrigen?: UbicacionAlmacen;
  @Column({ type: 'uuid', nullable: true }) ubicacionDestinoId?: string;
  @ManyToOne(() => UbicacionAlmacen, { nullable: true }) @JoinColumn({ name: 'ubicaciondestinoid' }) ubicacionDestino?: UbicacionAlmacen;
  @Column({ type: 'varchar', length: 100, default: 'PENDIENTE' }) numeroLote!: string;
  @Column({ type: 'date', nullable: true }) fechaCaducidad?: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) cantidad!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) cantidadSolicitada!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) cantidadEnviada!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) cantidadRecibida!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) cantidadDanada!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) costoUnitario!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) costoTotal!: number;
}
