import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Configuración fiscal de la empresa para timbrado CFDI 4.0.
 * Cada empresa tiene UNA configuración fiscal.
 */
@Entity('configuraciones_fiscales')
export class ConfiguracionFiscal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier', unique: true })
  empresaId!: string;

  // ── DATOS DEL EMISOR ────────────────────────────────────────────
  @Column({ type: 'varchar', length: 13 })
  rfc!: string;

  @Column({ type: 'varchar', length: 300 })
  razonSocial!: string;

  /** Código régimen fiscal SAT. Ej: 601=General de Ley PF, 612=PF Act. Emp. */
  @Column({ type: 'varchar', length: 10 })
  regimenFiscal!: string;

  /** Código postal del lugar de expedición (obligatorio CFDI 4.0) */
  @Column({ type: 'varchar', length: 10 })
  codigoPostalExpedicion!: string;

  // ── CREDENCIALES PAC (Facturama) ────────────────────────────────
  @Column({ type: 'varchar', length: 100 })
  facturamaUser!: string;

  @Column({ type: 'varchar', length: 200 })
  facturamaPassword!: string;

  /** true = sandbox, false = producción */
  @Column({ default: true })
  sandbox!: boolean;

  // ── SERIE Y FOLIO ───────────────────────────────────────────────
  @Column({ type: 'varchar', length: 10, default: 'A' })
  serie!: string;

  @Column({ type: 'int', default: 1 })
  folioActual!: number;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}