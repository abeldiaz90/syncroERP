import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Cliente } from './../clientes/entities/cliente.entity';
import { PartidaFactura } from './partida-factura.entity';

export enum EstadoFactura {
  BORRADOR   = 'BORRADOR',   // Pendiente de timbrar
  TIMBRADA   = 'TIMBRADA',   // Timbrada exitosamente por el PAC
  CANCELADA  = 'CANCELADA',  // Cancelada ante el SAT
}

export enum MetodoPago {
  PUE = 'PUE', // Pago en una sola exhibición
  PPD = 'PPD', // Pago en parcialidades o diferido
}

export enum FormaPago {
  EFECTIVO           = '01',
  CHEQUE             = '02',
  TRANSFERENCIA      = '03',
  TARJETA_CREDITO    = '04',
  TARJETA_DEBITO     = '28',
  POR_DEFINIR        = '99',
}

@Entity('facturas')
export class Factura {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  // ── IDENTIFICACIÓN ──────────────────────────────────────────────
  @Column({ type: 'varchar', length: 10, default: 'A' })
  serie!: string;

  @Column({ type: 'int' })
  folio!: number;

  @Column({ type: 'datetime2', default: () => 'GETDATE()' })
  fecha!: Date;

  // ── RECEPTOR ────────────────────────────────────────────────────
  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column({ type: 'uniqueidentifier', nullable: true })
  clienteId!: string;

  /** RFC del receptor al momento de timbrar (puede diferir si el cliente cambia) */
  @Column({ type: 'varchar', length: 13 })
  rfcReceptor!: string;

  @Column({ type: 'varchar', length: 300 })
  nombreReceptor!: string;

  @Column({ type: 'varchar', length: 10 })
  regimenFiscalReceptor!: string;

  @Column({ type: 'varchar', length: 10 })
  codigoPostalReceptor!: string;

  @Column({ type: 'varchar', length: 10, default: 'G03' })
  usoCFDI!: string;

  // ── PAGO ────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 3, default: FormaPago.TRANSFERENCIA })
  formaPago!: string;

  @Column({ type: 'varchar', length: 3, default: MetodoPago.PUE })
  metodoPago!: string;

  @Column({ type: 'varchar', length: 3, default: 'MXN' })
  moneda!: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio!: number;

  // ── TOTALES ─────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  descuento!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalImpuestosTrasladados!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  total!: number;

  // ── TIMBRE SAT ──────────────────────────────────────────────────
  @Column({
    type: 'varchar', length: 20,
    default: EstadoFactura.BORRADOR,
  })
  estado!: EstadoFactura;

  /** UUID del SAT una vez timbrada */
  @Column({ type: 'varchar', length: 36, nullable: true })
  uuid!: string;

  /** ID de la factura en Facturama */
  @Column({ type: 'varchar', length: 100, nullable: true })
  facturamaId!: string;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  xmlTimbrado!: string;

  // ── CANCELACIÓN ─────────────────────────────────────────────────
  @Column({ type: 'datetime2', nullable: true })
  fechaCancelacion!: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  motivoCancelacion!: string; // 01=Comprobante con errores, 02=No se realizó la operación

  @Column({ type: 'varchar', length: 36, nullable: true })
  uuidSustitucion!: string; // UUID de la factura que sustituye a esta

  @Column({ type: 'text', nullable: true })
  notas!: string;

  // ── PARTIDAS ────────────────────────────────────────────────────
  @OneToMany(() => PartidaFactura, p => p.factura, { cascade: true })
  partidas!: PartidaFactura[];

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}