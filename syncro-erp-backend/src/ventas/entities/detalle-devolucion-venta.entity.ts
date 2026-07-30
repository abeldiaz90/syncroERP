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
  @JoinColumn({ name: 'devolucionId' })
  devolucion!: DevolucionVenta;
  @Column({ type: 'uniqueidentifier' }) devolucionId!: string;

  @ManyToOne(() => DetalleVenta, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'detalleVentaId' })
  detalleVenta!: DetalleVenta;
  @Column({ type: 'uniqueidentifier' }) detalleVentaId!: string;

  @ManyToOne(() => Producto, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;
  @Column({ type: 'uniqueidentifier' }) productoId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 }) cantidad!: number;
  @Column({ type: 'varchar', length: 25 })
  condicion!: CondicionDevolucion;
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  subtotal!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  impuestoMonto!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
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
