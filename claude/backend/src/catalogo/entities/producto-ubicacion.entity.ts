import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';
import { UbicacionAlmacen } from './ubicacion-almacen.entity';

@Entity('producto_ubicaciones')
@Index('UQ_producto_ubicacion_empresa', ['empresaId','productoId','ubicacionId'], { unique: true })
@Index('IX_producto_ubicacion_producto_almacen', ['empresaId','productoId','almacenId'])
export class ProductoUbicacion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 36 }) empresaId!: string;
  @Column({ type: 'uuid' }) productoId!: string;
  @Column({ type: 'uuid' }) almacenId!: string;
  @Column({ type: 'uuid' }) ubicacionId!: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoid' }) producto!: Producto;
  @ManyToOne(() => Almacen, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'almacenid' }) almacen!: Almacen;
  @ManyToOne(() => UbicacionAlmacen, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ubicacionid' }) ubicacion!: UbicacionAlmacen;

  @Column({ default: false }) esPrincipal!: boolean;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, nullable: true }) capacidadAsignada?: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, nullable: true }) stockMinimo?: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, nullable: true }) stockMaximo?: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) observaciones?: string;
  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}
