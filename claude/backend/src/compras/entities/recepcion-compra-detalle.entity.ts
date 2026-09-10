import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RecepcionCompra } from './recepcion-compra.entity';
import { DetalleOrdenCompra } from './detalle-orden-compra.entity';

@Entity('recepciones_compra_detalle')
@Index(['empresaId', 'recepcionId'])
@Index(['empresaId', 'detalleOrdenCompraId'])
export class RecepcionCompraDetalle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  recepcionId!: string;

  @ManyToOne(() => RecepcionCompra, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recepcionid' })
  recepcion!: RecepcionCompra;

  @Column({ type: 'uuid' })
  detalleOrdenCompraId!: string;

  @ManyToOne(() => DetalleOrdenCompra, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'detalleordencompraid' })
  detalleOrdenCompra!: DetalleOrdenCompra;

  @Column({ type: 'uuid' })
  productoId!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidadAceptada!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidadRechazada!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  factorConversion!: number;

  @Column({ type: 'uuid', nullable: true })
  equivalenciaId?: string;

  @Column({ type: 'uuid' })
  ubicacionId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lote?: string;

  @Column({ type: 'date', nullable: true })
  fechaCaducidad?: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  costoUnitario!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motivoRechazo?: string;

  @CreateDateColumn()
  fechaRegistro!: Date;
}
