import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Factura } from '../cfdi/factura.entity';

@Entity('partidas_factura')
export class PartidaFactura {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Factura, f => f.partidas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facturaId' })
  factura!: Factura;

  @Column({ type: 'uniqueidentifier' })
  facturaId!: string;

  // ── IDENTIFICACIÓN DEL PRODUCTO ─────────────────────────────────
  @Column({ type: 'uniqueidentifier', nullable: true })
  productoId!: string;

  /** Clave del catálogo de productos SAT (obligatorio CFDI 4.0) */
  @Column({ type: 'varchar', length: 20 })
  claveSAT!: string;

  /** Clave de unidad de medida SAT */
  @Column({ type: 'varchar', length: 10 })
  claveUnidadSAT!: string;

  /** Unidad de medida en texto (ej: Pieza, Kilogramo) */
  @Column({ type: 'varchar', length: 50, default: 'Pieza' })
  unidadMedida!: string;

  /** Número de identificación interna (SKU) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  noIdentificacion!: string;

  @Column({ type: 'varchar', length: 1000 })
  descripcion!: string;

  // ── CANTIDADES Y PRECIOS ────────────────────────────────────────
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  descuento!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  subtotal!: number;

  // ── IMPUESTOS ───────────────────────────────────────────────────
  /** 01=No objeto, 02=Sí objeto, 03=Sí objeto no obligado a desglose */
  @Column({ type: 'varchar', length: 2, default: '02' })
  objetoImpuesto!: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  tasaIVA!: number; // 0.16 = 16%, 0 = exento

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  montoIVA!: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  total!: number;

  @Column({ type: 'int', default: 0 })
  orden!: number;
}