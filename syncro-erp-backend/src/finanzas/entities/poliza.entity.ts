import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany
} from 'typeorm';
import { PartidaPoliza } from './partida-poliza.entity';

export enum TipoPoliza {
  DIARIO  = 'DIARIO',
  INGRESO = 'INGRESO',
  EGRESO  = 'EGRESO',
}

@Entity('polizas')
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
  mes!: number;   // 1-12

  @Column({ type: 'int', default: 2025 })
  anio!: number;  // 2025, 2026...

  @Column({ type: 'bit', default: false })
  periodoCerrado!: boolean;
  // ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 255 })
  concepto!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  facturaId!: string;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @OneToMany(() => PartidaPoliza, (partida) => partida.poliza, { cascade: true })
  partidas!: PartidaPoliza[];
}