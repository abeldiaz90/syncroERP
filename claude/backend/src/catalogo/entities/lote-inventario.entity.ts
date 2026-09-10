import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Producto } from './producto.entity';
import { Almacen } from './almacen.entity';

/**
 * ============================================================================
 * SyncroERP · Lote de inventario
 * ----------------------------------------------------------------------------
 * CAMBIO IMPORTANTE: se agrega el costo.
 *
 * Antes el lote solo guardaba cuánto queda, nunca cuánto costó. Eso obligaba
 * al motor contable a inventar el costo de ventas usando
 * `producto.precioCompra` — el último precio de compra del catálogo — que no
 * tiene relación con lo que costó la mercancía que realmente salió.
 *
 * Consecuencia: la cuenta de Inventario del mayor se separa del valor físico
 * un poco en cada venta, en una dirección impredecible, y al cierre nadie
 * puede explicar la diferencia porque es la suma de cientos de errores que no
 * quedaron registrados.
 *
 * ── MÉTODO DE COSTEO ───────────────────────────────────────────────────────
 *
 * Promedio ponderado POR LOTE.
 *
 * Se eligió así, y no PEPS estricto, porque `obtenerOCrearLote()` fusiona las
 * entradas que comparten `numeroLote`, y el valor por omisión es 'ÚNICO': sin
 * seguimiento explícito de lotes, todas las compras de un producto caen en el
 * mismo registro. Forzar PEPS ahí exigiría rediseñar cómo se crean los lotes y
 * migrar los existentes.
 *
 * El promedio ponderado es un método reconocido por el SAT, es el más usado en
 * México, y funciona con los datos que ya tienes sin migración.
 *
 * Si en algún producto necesitas PEPS estricto, ya está soportado: basta con
 * capturar un `numeroLote` distinto en cada compra. Cada lote conserva su
 * propio costo y la salida los consume por caducidad.
 * ============================================================================
 */

@Entity('lotes_inventario')
@Index(['empresaId', 'productoId', 'almacenId'])
export class LoteInventario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoid' })
  producto!: Producto;

  @Column({ type: 'uuid' })
  productoId!: string;

  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacenid' })
  almacen!: Almacen;

  @Column({ type: 'uuid' })
  almacenId!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 100 })
  numeroLote!: string;

  @Column({ type: 'date', nullable: true })
  fechaCaducidad?: Date;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  stockRestante!: number;

  /**
   * Costo unitario promedio ponderado del lote.
   *
   * Cuatro decimales a propósito: con productos de bajo valor unitario
   * — un gramo de insumo, una pieza de tornillería — dos decimales redondean
   * el costo a cero y el inventario se valúa mal.
   *
   * Se recalcula en cada entrada:
   *   nuevo = (stockPrevio × costoPrevio + cantidad × costoEntrada)
   *           ÷ (stockPrevio + cantidad)
   */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  costoUnitario!: number;

  /**
   * Valor total del lote: stockRestante × costoUnitario.
   * Se almacena para que la valuación del inventario no tenga que multiplicar
   * fila por fila sobre decenas de miles de lotes.
   */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  valorTotal!: number;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaIngreso!: Date;
}
