import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TurnoCaja } from './turno-caja.entity';

export enum NaturalezaMovimientoCaja {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
}

export enum TipoMovimientoCaja {
  VENTA = 'VENTA',
  ENGANCHE = 'ENGANCHE',
  COBRANZA = 'COBRANZA',
  REEMBOLSO = 'REEMBOLSO',
  INGRESO_MANUAL = 'INGRESO_MANUAL',
  RETIRO = 'RETIRO',
  AJUSTE = 'AJUSTE',
}

@Entity('caja_movimientos')
@Index('IX_caja_movimientos_turno_fecha', ['turnoCajaId', 'fechaCreacion'])
@Index('IX_caja_movimientos_empresa_documento', ['empresaId', 'documentoId'])
@Index(
  'UX_caja_movimientos_turno_tipo_documento',
  ['turnoCajaId', 'tipo', 'documentoId'],
  { unique: true, where: 'documentoId IS NOT NULL' },
)
export class MovimientoCaja {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => TurnoCaja, (turno) => turno.movimientos, {
    nullable: false,
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'turnocajaid' })
  turno!: TurnoCaja;

  @Column({ type: 'uuid' })
  turnoCajaId!: string;

  @Column({ type: 'uuid' })
  cuentaCajaId!: string;

  @Column({ type: 'varchar', length: 20 })
  naturaleza!: NaturalezaMovimientoCaja;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoMovimientoCaja;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
  })
  importe!: number;

  @Column({ type: 'varchar', length: 300 })
  concepto!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referencia!: string | null;

  @Column({ type: 'uuid', nullable: true })
  documentoId!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  tipoDocumento!: string | null;

  @Column({ type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaCreacion!: Date;
}
