import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Cotizacion } from './cotizacion.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { DetalleOrdenCompra } from './detalle-orden-compra.entity';

export type EstadoRecepcionOC = 'PENDIENTE' | 'PARCIAL' | 'COMPLETA';
export type EstadoPagoOC = 'PENDIENTE' | 'PARCIAL' | 'PAGADA';

/**
 * Estado derivado, para pantallas y reportes.
 *
 * No es la verdad del documento: la verdad son `estadoRecepcion` y
 * `estadoPago`, que avanzan por separado. Este campo los resume en la etiqueta
 * que la gente de compras ya conoce, y se recalcula solo.
 */
export type EstadoOC =
  | 'PENDIENTE'
  | 'ENVIADA'
  | 'RECIBIDA'
  | 'CON_INCIDENCIAS'
  | 'PARCIALMENTE_PAGADA'
  | 'PAGADA'
  | 'CANCELADA';

@Entity('ordenes_compra')
export class OrdenCompra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Cotizacion)
  @JoinColumn({ name: 'cotizacionid' })
  cotizacion: Cotizacion;

  @Column({ type: 'uuid', nullable: true })
  cotizacionId: string;

  @ManyToOne(() => Proveedor)
  @JoinColumn({ name: 'proveedorid' })
  proveedor: Proveedor;

  @Column({ type: 'uuid' })
  proveedorId: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  totalPagado: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  saldoPendiente: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: EstadoOC;

  /** Cuánto ha llegado. Avanza sólo con las recepciones. */
  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estadoRecepcion: EstadoRecepcionOC;

  /** Cuánto se ha pagado. Avanza sólo con los pagos. */
  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estadoPago: EstadoPagoOC;

  @CreateDateColumn()
  fechaCreacion: Date;

  @OneToMany(() => DetalleOrdenCompra, (det) => det.ordenCompra, {
    cascade: true,
  })
  detalles: DetalleOrdenCompra[];
}

/**
 * Resume los dos ejes en la etiqueta única que usan las pantallas.
 *
 * El orden de las preguntas importa: el pago es lo último que ocurre, así que
 * manda sobre la recepción a la hora de etiquetar. Una orden completa y
 * liquidada se rotula PAGADA, no RECIBIDA.
 */
export function estadoDerivadoOC(orden: {
  estado: EstadoOC;
  estadoRecepcion: EstadoRecepcionOC;
  estadoPago: EstadoPagoOC;
}): EstadoOC {
  if (orden.estado === 'CANCELADA') return 'CANCELADA';
  if (orden.estadoPago === 'PAGADA') return 'PAGADA';
  if (orden.estadoPago === 'PARCIAL') return 'PARCIALMENTE_PAGADA';
  if (orden.estadoRecepcion === 'COMPLETA') return 'RECIBIDA';
  if (orden.estadoRecepcion === 'PARCIAL') return 'CON_INCIDENCIAS';
  return orden.estado === 'ENVIADA' ? 'ENVIADA' : 'PENDIENTE';
}

/**
 * Valor efectivamente recibido de una orden, con su impuesto proporcional.
 *
 * Es el techo de lo que se le puede pagar al proveedor. Pagar contra el total
 * ordenado cuando la entrega llegó corta es pagar mercancía que no está en el
 * almacén, y recuperarlo después es una gestión, no un asiento.
 *
 * El prorrateo es por partida y no sobre el total, porque las partidas no
 * valen lo mismo: recibir la mitad de las piezas de la partida barata no es
 * recibir la mitad de la orden.
 */
export function valorRecibidoOC(
  detalles: Array<{
    cantidad: number;
    cantidadRecibidaOk?: number;
    subtotal?: number;
    impuestoImporte?: number;
  }>,
): number {
  let recibido = 0;
  for (const det of detalles ?? []) {
    const ordenada = Number(det.cantidad ?? 0);
    if (ordenada <= 0) continue;
    const aceptada = Math.min(Number(det.cantidadRecibidaOk ?? 0), ordenada);
    const linea = Number(det.subtotal ?? 0) + Number(det.impuestoImporte ?? 0);
    recibido += linea * (aceptada / ordenada);
  }
  return Math.round((recibido + Number.EPSILON) * 100) / 100;
}
