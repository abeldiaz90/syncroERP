import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { DetalleVenta } from './detalle-venta.entity';

export type EstadoVenta =
  | 'COMPLETADA'
  | 'PARCIALMENTE_DEVUELTA'
  | 'DEVUELTA'
  | 'ANULADA'
  | 'PENDIENTE';
export type MetodoPago =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'CHEQUE'
  | 'CREDITO_30D'
  | 'CREDITO_60D'
  | 'CREDITO_90D'
  | 'MENSUALIDADES'
  | 'OTRO';

@Entity('ventas')
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId: string;

  // ── FOLIO ──────────────────────────────────────────────────────
  /** Número de ticket consecutivo por empresa */
  @Column({ type: 'int', default: 1 })
  folio: number;

  // ── RECEPTOR ───────────────────────────────────────────────────
  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'clienteId' })
  cliente?: Cliente;

  @Column({ type: 'uniqueidentifier', nullable: true })
  clienteId?: string;

  // ── VENDEDOR ───────────────────────────────────────────────────
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuarioId' })
  usuario?: Usuario;

  @Column({ type: 'uniqueidentifier', nullable: true })
  usuarioId?: string;

  // ── ALMACÉN DE DESPACHO ────────────────────────────────────────
  @Column({ type: 'uniqueidentifier', nullable: true })
  almacenId?: string;

  // ── TOTALES ────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  descuento: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  impuestoTotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  total: number;

  /** Saldo a favor del cliente consumido como forma de pago. */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  saldoFavorAplicado: number;

  /** Parte del saldo consumido que ya fue restituida por devoluciones. */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  saldoFavorRestituido: number;

  // ── PAGO ───────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 30, default: 'EFECTIVO' })
  metodoPago: MetodoPago;

  @Column({ type: 'uniqueidentifier', nullable: true })
  cuentaBancariaId?: string | null;

  /** Monto recibido (para calcular cambio en efectivo) */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  montoRecibido?: number;

  @Column({ type: 'varchar', length: 20, default: 'COMPLETADA' })
  estado: EstadoVenta;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  subtotalDevuelto: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  impuestoDevuelto: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalDevuelto: number;

  @Column({ type: 'datetime2', nullable: true })
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
