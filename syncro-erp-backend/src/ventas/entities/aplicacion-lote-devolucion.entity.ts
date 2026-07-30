import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DetalleDevolucionVenta } from './detalle-devolucion-venta.entity';
import { MovimientoInventario } from '../../catalogo/entities/movimiento-inventario.entity';
import { LoteInventario } from '../../catalogo/entities/lote-inventario.entity';

@Entity('aplicaciones_lote_devolucion')
export class AplicacionLoteDevolucion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(
    () => DetalleDevolucionVenta,
    (detalle) => detalle.aplicacionesLote,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'detalleDevolucionId' })
  detalle!: DetalleDevolucionVenta;
  @Column({ type: 'uniqueidentifier' }) detalleDevolucionId!: string;

  @ManyToOne(() => MovimientoInventario, {
    nullable: false,
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'movimientoSalidaId' })
  movimientoSalida!: MovimientoInventario;
  @Column({ type: 'uniqueidentifier' }) movimientoSalidaId!: string;

  @ManyToOne(() => LoteInventario, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'loteId' })
  lote!: LoteInventario | null;
  @Column({ type: 'uniqueidentifier', nullable: true }) loteId!: string | null;

  @Column({ type: 'uniqueidentifier' }) almacenId!: string;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) cantidad!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  costoUnitario!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  costoTotal!: number;
}
