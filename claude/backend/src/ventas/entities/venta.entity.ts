import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { DetalleVenta } from './detalle-venta.entity';
import { MetodoPagoVenta } from '../constants/metodos-pago';
import { ListaPrecio } from '../../catalogo/entities/lista-precio.entity';

export type EstadoVenta =
  | 'COMPLETADA'
  | 'PARCIALMENTE_DEVUELTA'
  | 'DEVUELTA'
  | 'ANULADA'
  | 'PENDIENTE';
export type MetodoPago = MetodoPagoVenta;

@Entity('ventas')
@Index('UX_ventas_empresa_folio', ['empresaId', 'folio'], { unique: true })
@Index('UX_ventas_empresa_idempotencia', ['empresaId', 'claveIdempotencia'], {
  unique: true,
  where: 'claveIdempotencia IS NOT NULL',
})
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  // ── FOLIO ──────────────────────────────────────────────────────
  /** Número de ticket consecutivo por empresa */
  @Column({ type: 'int', default: 1 })
  folio: number;

  // ── RECEPTOR ───────────────────────────────────────────────────
  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'clienteid' })
  cliente?: Cliente;

  @Column({ type: 'uuid', nullable: true })
  clienteId?: string;

  // ── VENDEDOR ───────────────────────────────────────────────────
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuarioid' })
  usuario?: Usuario;

  @Column({ type: 'uuid', nullable: true })
  usuarioId?: string;

  // ── ALMACÉN DE DESPACHO ────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  almacenId?: string;

  @ManyToOne(() => ListaPrecio, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'listaprecioid' })
  listaPrecio?: ListaPrecio;

  @Column({ type: 'uuid', nullable: true })
  listaPrecioId?: string | null;

  // ── TOTALES ────────────────────────────────────────────────────
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4, default: 0 })
  descuento: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4, default: 0 })
  impuestoTotal: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4, default: 0 })
  total: number;

  /** Saldo a favor del cliente consumido como forma de pago. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  saldoFavorAplicado: number;

  /** Parte del saldo consumido que ya fue restituida por devoluciones. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  saldoFavorRestituido: number;

  // ── PAGO ───────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 30, default: 'EFECTIVO' })
  metodoPago: MetodoPago;

  /** Evita ventas duplicadas por doble clic, timeout o reintento del navegador. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotencia?: string | null;

  @Column({ type: 'uuid', nullable: true })
  cuentaBancariaId?: string | null;

  /** Monto recibido (para calcular cambio en efectivo) */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4, nullable: true })
  montoRecibido?: number;

  /** Cambio realmente entregado al cliente; se calcula y persiste en servidor. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 12, scale: 4, default: 0 })
  cambio!: number;

  @Column({ type: 'varchar', length: 20, default: 'COMPLETADA' })
  estado: EstadoVenta;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  subtotalDevuelto: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  impuestoDevuelto: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  totalDevuelto: number;

  @Column({ type: 'timestamptz', nullable: true })
  fechaUltimaDevolucion?: Date | null;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  fechaVenta: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;

  @OneToMany(() => DetalleVenta, (d) => d.venta, { cascade: true })
  detalles: DetalleVenta[];
}
