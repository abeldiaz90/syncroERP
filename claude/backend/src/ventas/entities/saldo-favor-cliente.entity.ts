import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TipoMovimientoSaldoFavor {
  ABONO = 'ABONO',
  CARGO = 'CARGO',
}

@Entity('saldos_favor_clientes_movimientos')
@Index(['empresaId', 'clienteId', 'fecha'])
@Index(['empresaId', 'devolucionId'], {
  unique: true,
  where: 'devolucionId IS NOT NULL',
})
@Index('UX_saldo_favor_venta_cargo', ['empresaId', 'ventaId'], {
  unique: true,
  where: "ventaId IS NOT NULL AND tipo = 'CARGO'",
})
export class SaldoFavorClienteMovimiento {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) clienteId!: string;
  @Column({ type: 'uuid', nullable: true })
  devolucionId!: string | null;
  @Column({ type: 'uuid', nullable: true })
  ventaId!: string | null;
  @Column({ type: 'varchar', length: 10 }) tipo!: TipoMovimientoSaldoFavor;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) importe!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  saldoPosterior!: number;
  @Column({ type: 'varchar', length: 250 }) concepto!: string;
  @Column({ type: 'uuid', nullable: true })
  usuarioId!: string | null;
  @CreateDateColumn() fecha!: Date;
}
