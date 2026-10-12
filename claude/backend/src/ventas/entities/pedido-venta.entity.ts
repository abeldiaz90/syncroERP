import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Producto } from '../../catalogo/entities/producto.entity';

/**
 * ============================================================================
 * EL PEDIDO DE VENTA: EL DOCUMENTO QUE FALTABA DEL OTRO LADO
 * ----------------------------------------------------------------------------
 * El ciclo de compra tiene tres documentos —requisición, orden, recepción— y
 * desde ayer cuatro, con la factura del proveedor. El de venta tenía UNO: la
 * venta, que es un documento de mostrador. Cobra, descarga inventario y asienta
 * la póliza en el mismo acto.
 *
 * Eso deja sin registrar todo lo que pasa ANTES de cobrar:
 *
 *   · «Apártame diez y paso el viernes.»   → nada reserva esas diez.
 *   · «Quiero cincuenta, tienes treinta.»  → las veinte que faltan no existen
 *                                            en ningún lado; el cliente las
 *                                            espera y el sistema no las sabe.
 *   · «Mándame la mitad ahora.»            → dos ventas sueltas que nadie
 *                                            relaciona con el mismo compromiso.
 *
 * Mientras no exista este documento, todo eso vive en una libreta o en un
 * WhatsApp, y el inventario disponible miente: enseña como libres unidades que
 * ya están comprometidas con alguien.
 *
 * ── LO QUE EL PEDIDO NO HACE ──────────────────────────────────────────────
 *
 * No mueve inventario y no toca la contabilidad. Una reserva no es una salida:
 * la mercancía sigue en el almacén y sigue siendo del negocio hasta que se
 * entrega. Lo único que cambia es que deja de contarse como disponible para
 * otro cliente.
 *
 * Quien mueve inventario y asienta es la VENTA que nace al surtir, por el
 * camino de siempre. Este módulo no construye una segunda forma de vender.
 * ============================================================================
 */

export type EstadoPedidoVenta =
  /** Se está capturando. No reserva nada. */
  | 'BORRADOR'
  /** Comprometido con el cliente: lo que había quedó reservado. */
  | 'CONFIRMADO'
  /** Salió parte. Lo que falta sigue reservado o sigue en espera. */
  | 'SURTIDO_PARCIAL'
  /** Salió todo. */
  | 'SURTIDO'
  /** Se canceló: lo reservado se devolvió a disponible. */
  | 'CANCELADO';

@Entity('pedidos_venta')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'clienteId'])
export class PedidoVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /** `PV-2026-000001`: se dice por teléfono y se anota en la remisión. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  folio!: string | null;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'clienteid' })
  cliente?: Cliente;

  @Column({ type: 'uuid', nullable: true })
  clienteId!: string | null;

  /** De qué almacén se compromete la mercancía: ahí se reserva. */
  @Column({ type: 'uuid', nullable: true })
  almacenId!: string | null;

  /** La lista con la que se pactó el precio, para surtir con la misma. */
  @Column({ type: 'uuid', nullable: true })
  listaPrecioId!: string | null;

  @Column({ type: 'date' })
  fechaPedido!: Date;

  /** Cuándo se le dijo al cliente que lo tendría. */
  @Column({ type: 'date', nullable: true })
  fechaCompromiso!: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: EstadoPedidoVenta;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  descuento!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  impuestoTotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  total!: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notas!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  motivoCancelacion!: string | null;

  @Column({ type: 'uuid', nullable: true })
  creadoPorId!: string | null;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @OneToMany(() => DetallePedidoVenta, (d) => d.pedido)
  detalles!: DetallePedidoVenta[];
}

@Entity('pedidos_venta_detalle')
@Index(['pedidoId'])
export class DetallePedidoVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PedidoVenta, (p) => p.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedidoid' })
  pedido!: PedidoVenta;

  @Column({ type: 'uuid' })
  pedidoId!: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'productoid' })
  producto?: Producto;

  @Column({ type: 'uuid' })
  productoId!: string;

  /** Lo que el cliente pidió. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  cantidad!: number;

  /**
   * Lo que se le ha entregado. Se escribe desde la venta que de verdad salió,
   * no desde lo que se pidió surtir: si la venta entregó menos —porque el
   * almacén no tenía todo—, el renglón no puede quedar marcado como completo.
   */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidadSurtida!: number;

  /**
   * Lo que quedó reservado para este renglón. Puede ser MENOR que `cantidad`:
   * esa diferencia es el *backorder*, y es justamente el dato que hoy no
   * existe en ninguna parte.
   */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidadReservada!: number;

  /** La reserva de inventario que respalda este renglón, si la hay. */
  @Column({ type: 'uuid', nullable: true })
  reservaId!: string | null;

  /** El precio pactado. Al surtir se compara contra el vigente. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  precioUnitario!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  descuento!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 7, scale: 4, default: 0 })
  impuestoPorcentaje!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  impuestoMonto!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  subtotal!: number;
}
