import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';
import { UbicacionAlmacen } from './ubicacion-almacen.entity';
import { LoteInventario } from './lote-inventario.entity';

export enum EstadoStockUbicacion { DISPONIBLE='DISPONIBLE', CUARENTENA='CUARENTENA', BLOQUEADO='BLOQUEADO', DANADO='DANADO', CADUCADO='CADUCADO' }

@Entity('stock_ubicaciones')
@Index('UQ_stock_ubicacion_lote_estado', ['empresaId','productoId','almacenId','ubicacionId','loteId','estado'], { unique: true })
@Index('IX_stock_ubicaciones_producto_almacen', ['empresaId','productoId','almacenId'])
export class StockUbicacion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type:'varchar', length:36 }) empresaId!: string;
  @Column({ type: 'uuid' }) productoId!: string;
  @Column({ type: 'uuid' }) almacenId!: string;
  @Column({ type: 'uuid' }) ubicacionId!: string;
  @Column({ type: 'uuid', nullable:true }) loteId?: string;
  @Column({ type:'varchar', length:20, default:EstadoStockUbicacion.DISPONIBLE }) estado!: EstadoStockUbicacion;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:4, default:0 }) cantidad!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision:18, scale:4, default:0 }) reservado!: number;
  @ManyToOne(() => Producto, { onDelete:'NO ACTION' }) @JoinColumn({ name:'productoid' }) producto!: Producto;
  @ManyToOne(() => Almacen, { onDelete:'NO ACTION' }) @JoinColumn({ name:'almacenid' }) almacen!: Almacen;
  @ManyToOne(() => UbicacionAlmacen, { onDelete:'NO ACTION' }) @JoinColumn({ name:'ubicacionid' }) ubicacion!: UbicacionAlmacen;
  @ManyToOne(() => LoteInventario, { nullable:true, onDelete:'NO ACTION' }) @JoinColumn({ name:'loteid' }) lote?: LoteInventario;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
