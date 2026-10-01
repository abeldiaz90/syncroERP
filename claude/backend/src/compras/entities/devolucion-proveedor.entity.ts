import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrdenCompra } from './orden-compra.entity';
import { Producto } from '../../catalogo/entities/producto.entity';
import { Almacen } from '../../catalogo/entities/almacen.entity';

/**
 * ============================================================================
 * Devolución a proveedor
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE
 *
 * Hasta el 26-sep-2026 el sistema no sabía devolver mercancía. Peor: el
 * mensaje que impedía cancelar una orden ya recibida decía «Registra la
 * devolución al proveedor», y esa devolución no existía en ninguna parte —ni
 * endpoint, ni pantalla, ni asiento—. Quien llegaba ahí con una caja rota en
 * el andén no tenía ningún lugar donde ponerla.
 *
 * QUÉ ES, CONTABLEMENTE
 *
 * El inventario de este ERP es PERPETUO: la compra carga la mercancía
 * directamente a Inventario y abona a Proveedores. La devolución es ese mismo
 * asiento al revés, partida por partida:
 *
 *   Dr. 201.01 Proveedores           (el total, IVA incluido)
 *       Cr. 115.01 Inventario        (el costo de lo que sale)
 *       Cr. 119.01 / 118.01 IVA      (el impuesto que se deja de acreditar)
 *
 * No se usa la 503 «Devoluciones, descuentos o bonificaciones sobre compras»:
 * esa cuenta es del sistema PERIÓDICO, donde la compra va a la 502. Meter aquí
 * la 503 dejaría el inventario inflado y el costo mal por el mismo importe.
 *
 * El IVA se abona donde esté: en 119 «pendiente de pago» si la orden no se ha
 * pagado, y en 118 «acreditable pagado» si ya se liquidó. Devolver lo que aún
 * no se paga y devolver lo ya pagado no son el mismo asiento.
 *
 * QUÉ NO ES
 *
 * No es un ajuste de inventario. Un ajuste dice «había menos de lo que
 * pensábamos» y su contrapartida es una merma. Una devolución dice «esto se lo
 * regresamos al proveedor» y su contrapartida es la cuenta por pagar: cambia
 * lo que le debemos, y eso ningún ajuste lo hace.
 * ============================================================================
 */

export enum EstadoDevolucionProveedor {
  REGISTRADA = 'REGISTRADA',
  CANCELADA = 'CANCELADA',
}

@Entity('devoluciones_proveedor')
/* Dos documentos con el mismo folio es lo que la base tiene que impedir:
 * una carrera entre dos altas simultáneas no da error sin este índice,
 * da dos documentos con el mismo número en silencio. */
@Index(['empresaId', 'folio'], { unique: true, where: 'folio IS NOT NULL' })
@Index(['empresaId', 'fecha'])
@Index(['empresaId', 'ordenCompraId'])
export class DevolucionProveedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  empresaId!: string;

  /** `DP-000001`. Consecutivo por empresa. */
  @Column({ type: 'varchar', length: 20 })
  folio!: string;

  @ManyToOne(() => OrdenCompra)
  @JoinColumn({ name: 'ordencompraid' })
  ordenCompra?: OrdenCompra;

  @Column({ type: 'uuid' })
  ordenCompraId!: string;

  @Column({ type: 'uuid' })
  proveedorId!: string;

  /** De dónde sale la mercancía. */
  @ManyToOne(() => Almacen)
  @JoinColumn({ name: 'almacenid' })
  almacen?: Almacen;

  @Column({ type: 'uuid' })
  almacenId!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  /**
   * Por qué se devuelve. Obligatorio y con cuerpo: dentro de seis meses, este
   * texto es lo único que explicará por qué salió mercancía sin venderse.
   */
  @Column({ type: 'varchar', length: 500 })
  motivo!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoDevolucionProveedor.REGISTRADA })
  estado!: EstadoDevolucionProveedor;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  impuestos!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  total!: number;

  /** La nota de crédito que el proveedor emite por esta devolución, si llegó. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  notaCreditoProveedor?: string | null;

  @Column({ type: 'uuid', nullable: true })
  usuarioId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  polizaId?: string | null;

  @OneToMany(() => DevolucionProveedorDetalle, (d) => d.devolucion, {
    cascade: false,
  })
  detalles?: DevolucionProveedorDetalle[];

  @CreateDateColumn()
  fechaCreacion!: Date;
}

@Entity('devoluciones_proveedor_detalle')
@Index(['devolucionId'])
export class DevolucionProveedorDetalle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  empresaId!: string;

  @ManyToOne(() => DevolucionProveedor, (d) => d.detalles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'devolucionid' })
  devolucion?: DevolucionProveedor;

  @Column({ type: 'uuid' })
  devolucionId!: string;

  /** La partida de la orden de la que sale: es la que limita la cantidad. */
  @Column({ type: 'uuid' })
  detalleOrdenId!: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoid' })
  producto?: Producto;

  @Column({ type: 'uuid' })
  productoId!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  cantidad!: number;

  /**
   * El costo al que se compró, no el costo promedio de hoy.
   *
   * Una devolución se le cobra al proveedor a su precio pactado; que el
   * promedio del almacén haya cambiado por otras compras no es asunto suyo.
   */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  costoUnitario!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 7, scale: 4, default: 0 })
  tasaIva!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  impuesto!: number;
}
