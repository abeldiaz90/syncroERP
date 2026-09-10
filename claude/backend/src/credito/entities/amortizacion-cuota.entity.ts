import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { CreditoCliente } from './credito-cliente.entity';

export enum EstadoCuota {
  PENDIENTE = 'PENDIENTE',
  PAGADA = 'PAGADA',
  PAGO_PARCIAL = 'PAGO_PARCIAL',
  VENCIDA = 'VENCIDA',
}

@Entity('amortizacion_cuotas')
export class AmortizacionCuota {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => CreditoCliente, (c) => c.cuotas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creditoid' })
  credito!: CreditoCliente;
  @Column({ type: 'uuid' }) creditoId!: string;
  @Column({ type: 'int' }) numeroCuota!: number;
  @Column({ type: 'date' }) fechaVencimiento!: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) montoCapital!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  montoInteres!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) montoCuota!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) saldoRestante!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  montoPagado!: number;
  @Column({ type: 'date', nullable: true }) fechaPago!: Date;
  @Column({ type: 'varchar', length: 20, default: EstadoCuota.PENDIENTE })
  estado!: EstadoCuota;
  @CreateDateColumn() fechaCreacion!: Date;
}
