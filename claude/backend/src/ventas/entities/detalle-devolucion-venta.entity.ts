import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DevolucionVenta } from './devolucion-venta.entity';
import { DetalleVenta } from './detalle-venta.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { AplicacionLoteDevolucion } from './aplicacion-lote-devolucion.entity';

export enum CondicionDevolucion {
  REINTEGRABLE = 'REINTEGRABLE',
  DANADO = 'DANADO',
  NO_REINTEGRABLE = 'NO_REINTEGRABLE',
}

@Entity('detalles_devolucion_venta')
export class DetalleDevolucionVenta {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => DevolucionVenta, (devolucion) => devolucion.detalles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'devolucionid' })
  devolucion!: DevolucionVenta;
  @Column({ type: 'uuid' }) devolucionId!: string;

  @ManyToOne(() => DetalleVenta, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'detalleventaid' })
  detalleVenta!: DetalleVenta;
  @Column({ type: 'uuid' }) detalleVentaId!: string;

  @ManyToOne(() => Producto, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'productoid' })
  producto!: Producto;
  @Column({ type: 'uuid' }) productoId!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) cantidad!: number;
  @Column({ type: 'varchar', length: 25 })
  condicion!: CondicionDevolucion;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  subtotal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  impuestoMonto!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  costoTotal!: number;

  @OneToMany(
    () => AplicacionLoteDevolucion,
    (aplicacion) => aplicacion.detalle,
    {
      cascade: true,
    },
  )
  aplicacionesLote!: AplicacionLoteDevolucion[];
}
