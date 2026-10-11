import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';

export type EstadoFacturaProveedor =
  /** Capturada. Todavía no se ha cotejado contra la orden y la recepción. */
  | 'REGISTRADA'
  /** Cotejada y sin diferencias: se puede pagar. */
  | 'CONCILIADA'
  /** Cotejada y con diferencias: alguien tiene que mirarla antes de pagar. */
  | 'CON_DIFERENCIAS'
  /** El proveedor la canceló ante el SAT, o se capturó mal. */
  | 'CANCELADA';

/**
 * ============================================================================
 * EL TERCER LADO DEL TRIÁNGULO
 * ----------------------------------------------------------------------------
 * El ciclo de compra tenía dos documentos de los tres que debe tener: la ORDEN
 * —lo que pedí— y la RECEPCIÓN —lo que llegó—. Faltaba el que dice **lo que me
 * cobran**, y sin él se pagaba contra la recepción.
 *
 * Pagar contra la recepción significa que nadie compara nunca el precio
 * facturado con el pactado. Si el proveedor sube el precio en su factura, el
 * ERP paga lo recibido al precio de la ORDEN y la diferencia aparece después
 * como una discrepancia en el estado de cuenta del proveedor, meses más tarde,
 * sin que nadie pueda decir en qué documento se metió.
 *
 * Y en México hay una segunda razón, que no es de control sino legal: **el
 * documento que detona la cuenta por pagar y el IVA acreditable es el CFDI que
 * emite el proveedor**, no el acuse de recepción del almacén. Sin esa fila, el
 * ERP no sabe con qué comprobante se acreditó el IVA que ya reclasificó.
 *
 * ── EL COTEJO DE TRES VÍAS ────────────────────────────────────────────────
 *
 * Es lo que hacen todos los ERP serios y se llama así porque son tres cifras:
 *
 *     lo que PEDÍ   (orden)      ¿me cobran lo que pedí?
 *     lo que LLEGÓ  (recepción)  ¿me cobran lo que llegó?
 *     lo que me COBRAN (factura) ¿al precio que acordamos?
 *
 * Las tres tienen que coincidir dentro de una tolerancia antes de pagar. El
 * resultado vive en `resultadoCotejoJson` porque es una FOTO del momento en
 * que se cotejó: si mañana llega otra remesa, el cotejo de ayer no cambia, y
 * esa es justamente la información que alguien va a querer cuando pregunte por
 * qué se autorizó el pago.
 *
 * ── POR QUÉ `ordenCompraId` ES OPCIONAL ───────────────────────────────────
 *
 * Porque hay facturas sin orden: el recibo de la luz, el honorario del
 * contador, la refacción que alguien compró de urgencia. Obligar a inventarles
 * una orden de compra llenaría el sistema de órdenes falsas y la métrica de
 * compras dejaría de significar nada. Sin orden no hay cotejo de tres vías
 * —no hay contra qué cotejar— y la factura lo dice en vez de fingir que lo
 * hubo.
 * ============================================================================
 */
@Entity('facturas_proveedor')
@Index('UX_factura_proveedor_uuid', ['empresaId', 'uuidFiscal'], {
  unique: true,
  where: '"uuidfiscal" IS NOT NULL',
})
@Index('IX_facturas_proveedor_orden', ['ordenCompraId'])
@Index('IX_facturas_proveedor_empresa_estado', ['empresaId', 'estado'])
export class FacturaProveedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  /** Folio interno, el que una persona puede decir por teléfono. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  folio?: string | null;

  @Column({ type: 'uuid' })
  proveedorId!: string;

  /**
   * La orden que esta factura cobra. Nulo para las que no nacen de una compra
   * —luz, honorarios, una refacción de urgencia—: ésas no tienen cotejo de
   * tres vías y la factura lo dice, en vez de fingir que lo hubo.
   */
  @Column({ type: 'uuid', nullable: true })
  ordenCompraId!: string | null;

  /**
   * El UUID del CFDI. Es la llave real del documento ante el SAT y por eso es
   * único: capturar dos veces la misma factura es cómo se paga dos veces, y es
   * un error que sólo se ve conciliando el estado de cuenta del proveedor.
   *
   * Nulo se admite porque hay comprobantes que no son CFDI —un proveedor del
   * extranjero, un recibo simple— y rechazarlos obligaría a inventar un UUID.
   * El índice único es parcial para que varios nulos convivan.
   */
  @Column({ type: 'varchar', length: 36, nullable: true })
  uuidFiscal!: string | null;

  /** La serie y el folio que el proveedor puso en SU documento. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  folioProveedor!: string | null;

  @Column({ type: 'date' })
  fechaEmision!: Date;

  @Column({ type: 'date', nullable: true })
  fechaVencimiento!: Date | null;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  impuestos!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'varchar', length: 3, default: 'MXN' })
  moneda!: string;

  @Column({ type: 'varchar', length: 20, default: 'REGISTRADA' })
  estado!: EstadoFacturaProveedor;

  /**
   * La foto del cotejo. Se guarda y no se recalcula al vuelo porque es la
   * prueba de con qué cifras se autorizó el pago: si mañana llega otra remesa,
   * el cotejo de ayer no cambia, y eso es justo lo que alguien va a querer ver
   * cuando pregunte por qué se pagó.
   */
  @Column({ type: 'text', nullable: true })
  resultadoCotejoJson!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCotejo!: Date | null;

  /** El XML del CFDI, si se capturó. Es lo que pide el SAT en una revisión. */
  @Column({ type: 'text', nullable: true })
  xml!: string | null;

  @Column({ type: 'uuid', nullable: true })
  registradaPorId!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notas!: string | null;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @OneToMany(() => FacturaProveedorDetalle, (d) => d.factura, { cascade: true })
  detalles!: FacturaProveedorDetalle[];
}

/**
 * Una partida de la factura del proveedor.
 *
 * `detalleOrdenId` es lo que la ata a la orden y lo que hace posible el cotejo:
 * sin él se podría comparar el total pero no el precio de cada renglón, y es en
 * el renglón donde se esconde la diferencia —el total puede cuadrar con una
 * partida de más y otra de menos—.
 */
@Entity('facturas_proveedor_detalle')
@Index('IX_factura_proveedor_detalle_factura', ['facturaId'])
@Index('IX_factura_proveedor_detalle_orden', ['detalleOrdenId'])
export class FacturaProveedorDetalle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => FacturaProveedor, (f) => f.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facturaid' })
  factura!: FacturaProveedor;

  @Column({ type: 'uuid' })
  facturaId!: string;

  /** La partida de la orden que esta línea cobra. Nulo si la factura no tiene orden. */
  @Column({ type: 'uuid', nullable: true })
  detalleOrdenId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  productoId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion!: string | null;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  cantidad!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  precioUnitario!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 7, scale: 4, default: 0 })
  tasaIva!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  impuesto!: number;
}
