import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PartidaPoliza } from './partida-poliza.entity';

export enum TipoPoliza {
  DIARIO = 'DIARIO',
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

/**
 * Estatus de una póliza.
 *  · VIGENTE   — póliza normal, afecta saldos.
 *  · CANCELADA — se le generó una póliza de reversa. NUNCA se borra.
 *  · REVERSA   — es la póliza espejo que cancela a otra.
 *
 * Regla contable: una póliza jamás se elimina ni se edita. Corregir
 * significa emitir su reversa (cargos y abonos invertidos), igual que
 * el FB08 de SAP. Ambas quedan en el libro y su suma es cero.
 */
export type EstatusPoliza = 'VIGENTE' | 'CANCELADA' | 'REVERSA';

@Entity('polizas')
@Index('UX_polizas_empresa_origen', ['empresaId', 'origenClave'], {
  unique: true,
  where: 'origenClave IS NOT NULL',
})
@Index('UX_polizas_empresa_folio', ['empresaId', 'folio'], { unique: true })
export class Poliza {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TipoPoliza;

  @Column({ type: 'varchar', length: 50 })
  folio!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  // ── Período contable ──────────────────────────────────────────
  @Column({ type: 'int', default: 1 })
  mes!: number; // 1-12

  @Column({ type: 'int', default: 2025 })
  anio!: number; // 2025, 2026...

  @Column({ type: 'bit', default: false })
  periodoCerrado!: boolean;
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 255 })
  concepto!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  facturaId!: string;

  /** Llave estable del hecho que originó la póliza; evita duplicados al reintentar. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  origenClave!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  origenTipo!: string | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  origenId!: string | null;

  // ── Cancelación / reverso ────────────────────────────────────
  /** VIGENTE por omisión. Las pólizas anteriores a esta función quedan VIGENTE. */
  @Column({ type: 'varchar', length: 20, default: 'VIGENTE' })
  estatus!: EstatusPoliza;

  /** En la póliza de REVERSA: apunta a la póliza original que cancela. */
  @Column({ type: 'uniqueidentifier', nullable: true })
  polizaOrigenId!: string | null;

  /** En la póliza CANCELADA: apunta a la reversa que la anuló. */
  @Column({ type: 'uniqueidentifier', nullable: true })
  polizaReversaId!: string | null;

  /** Por qué se canceló. Obligatorio al cancelar (rastro de auditoría). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  motivoCancelacion!: string | null;

  /** Correo del usuario que ejecutó la cancelación. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  canceladaPor!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaCancelacion!: Date | null;
  // ─────────────────────────────────────────────────────────────

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @OneToMany(() => PartidaPoliza, (partida) => partida.poliza, {
    cascade: true,
  })
  partidas!: PartidaPoliza[];
}
