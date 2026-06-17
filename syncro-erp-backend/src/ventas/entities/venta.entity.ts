import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { Usuario } from '../../iam/entities/usuario.entity';
import { DetalleVenta } from './detalle-venta.entity';

export type EstadoVenta = 'COMPLETADA' | 'ANULADA' | 'PENDIENTE';
export type MetodoPago  = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';

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

  // ── PAGO ───────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 30, default: 'EFECTIVO' })
  metodoPago: MetodoPago;

  /** Monto recibido (para calcular cambio en efectivo) */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  montoRecibido?: number;

  @Column({ type: 'varchar', length: 20, default: 'COMPLETADA' })
  estado: EstadoVenta;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  fechaVenta: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;

  @OneToMany(() => DetalleVenta, d => d.venta, { cascade: true })
  detalles: DetalleVenta[];
}