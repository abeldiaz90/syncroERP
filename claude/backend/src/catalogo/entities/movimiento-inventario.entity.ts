import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';

/**
 * ============================================================================
 * SyncroERP · Movimiento de inventario
 * ----------------------------------------------------------------------------
 * CAMBIO IMPORTANTE: el movimiento ahora registra su costo real.
 *
 * Este es el dato que hacía falta para que la contabilidad de inventarios
 * cuadre. Cada salida guarda cuánto costaba exactamente la mercancía que se
 * consumió, tomado del lote del que salió — no el precio de compra vigente en
 * el catálogo.
 *
 * Con esto el kardex vale por sí solo: se puede reconstruir el valor del
 * inventario a cualquier fecha sumando movimientos, y contrastarlo contra el
 * saldo de la cuenta contable.
 *
 * Se agregaron índices por `(empresaId, fechaMovimiento)` y
 * `(productoId, almacenId)`: los reportes de kardex y valuación filtran
 * siempre por ahí, y hasta hoy recorrían la tabla completa.
 * ============================================================================
 */

@Entity('movimientos_inventario')
@Index(['empresaId', 'fechaMovimiento'])
@Index(['productoId', 'almacenId'])
export class MovimientoInventario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id' })
  empresaId!: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ name: 'producto_id' })
  productoId!: string;

  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacen_id' })
  almacen!: Almacen;

  @Column({ name: 'almacen_id' })
  almacenId!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidad!: number;

  @Column({
    type: 'decimal', transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    name: 'stock_anterior',
    default: 0,
  })
  stockAnterior!: number;

  @Column({
    type: 'decimal', transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    name: 'stock_nuevo',
    default: 0,
  })
  stockNuevo!: number;

  /* ── Costo ─────────────────────────────────────────────────────────────── */

  /**
   * Costo unitario de ESTE movimiento.
   * En una entrada, lo que se pagó. En una salida, lo que costaba el lote del
   * que se tomó la mercancía.
   */
  @Column({
    type: 'decimal', transformer: decimalNumberTransformer,
    precision: 18,
    scale: 4,
    name: 'costo_unitario',
    default: 0,
  })
  costoUnitario!: number;

  /**
   * cantidad × costoUnitario, redondeado a dos decimales.
   * Es el importe que va a la póliza. Se almacena calculado para que el asiento
   * contable y el kardex no puedan diferir por redondeo.
   */
  @Column({
    type: 'decimal', transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    name: 'costo_total',
    default: 0,
  })
  costoTotal!: number;

  /* ── Trazabilidad ──────────────────────────────────────────────────────── */

  @Column({ type: 'varchar', length: 255 })
  motivo!: string;

  @Column({ name: 'usuario_id', nullable: true })
  usuarioId?: string;

  /** Documento que originó el movimiento: venta, orden de compra, producción. */
  @Column({ type: 'uuid', name: 'documento_id', nullable: true })
  documentoId?: string;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'tipo_documento',
    nullable: true,
  })
  tipoDocumento?: string;

  @CreateDateColumn({ name: 'fecha_movimiento' })
  fechaMovimiento!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lote?: string;

  /** Lote concreto del que salió: permite auditar el costeo pieza por pieza. */
  @Column({ type: 'uuid', name: 'lote_id', nullable: true })
  loteId?: string;

  @Column({ type: 'date', nullable: true })
  fechaCaducidadMovimiento?: Date;
}
