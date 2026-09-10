import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
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
  @JoinColumn({ name: 'detalledevolucionid' })
  detalle!: DetalleDevolucionVenta;
  @Column({ type: 'uuid' }) detalleDevolucionId!: string;

  @ManyToOne(() => MovimientoInventario, {
    nullable: false,
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'movimientosalidaid' })
  movimientoSalida!: MovimientoInventario;
  @Column({ type: 'uuid' }) movimientoSalidaId!: string;

  @ManyToOne(() => LoteInventario, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'loteid' })
  lote!: LoteInventario | null;
  @Column({ type: 'uuid', nullable: true }) loteId!: string | null;

  @Column({ type: 'uuid' }) almacenId!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) cantidad!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  costoUnitario!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  costoTotal!: number;
}
