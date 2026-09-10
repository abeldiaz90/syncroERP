import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';
import { DetalleDevolucionVenta } from './detalle-devolucion-venta.entity';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';

export enum EstadoDevolucion {
  PROCESADA = 'PROCESADA',
}

export enum ResolucionDevolucion {
  REEMBOLSO = 'REEMBOLSO',
  SALDO_FAVOR = 'SALDO_FAVOR',
  AJUSTE_CXC = 'AJUSTE_CXC',
  MIXTA = 'MIXTA',
}

export enum EstadoFiscalDevolucion {
  NO_REQUERIDO = 'NO_REQUERIDO',
  PENDIENTE_NOTA_CREDITO = 'PENDIENTE_NOTA_CREDITO',
  NOTA_CREDITO_GENERADA = 'NOTA_CREDITO_GENERADA',
  ERROR_NOTA_CREDITO = 'ERROR_NOTA_CREDITO',
}

@Entity('devoluciones_venta')
@Index(['empresaId', 'folio'], { unique: true })
@Index(['empresaId', 'ventaId'])
@Index(['empresaId', 'claveIdempotencia'], {
  unique: true,
  where: 'claveIdempotencia IS NOT NULL',
})
export class DevolucionVenta {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @ManyToOne(() => Venta, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ventaid' })
  venta!: Venta;
  @Column({ type: 'uuid' }) ventaId!: string;

  @Column({ type: 'int' }) folio!: number;
  @Column({ type: 'varchar', length: 20, default: EstadoDevolucion.PROCESADA })
  estado!: EstadoDevolucion;

  @Column({ type: 'varchar', length: 500 }) motivo!: string;
  @Column({ type: 'varchar', length: 20 })
  resolucion!: ResolucionDevolucion;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) subtotal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 })
  impuestoTotal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4 }) total!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  costoReintegrado!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  costoDanado!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  ajusteCxC!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  importeReembolso!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 })
  saldoFavorGenerado!: number;

  @ManyToOne(() => CuentaBancaria, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cuentabancariaid' })
  cuentaBancaria!: CuentaBancaria | null;
  @Column({ type: 'uuid', nullable: true })
  cuentaBancariaId!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  metodoReembolso!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true })
  referenciaReembolso!: string | null;

  @Column({
    type: 'varchar',
    length: 35,
    default: EstadoFiscalDevolucion.NO_REQUERIDO,
  })
  estadoFiscal!: EstadoFiscalDevolucion;
  @Column({ type: 'uuid', nullable: true })
  facturaOrigenId!: string | null;
  @Column({ type: 'uuid', nullable: true })
  notaCreditoId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotencia!: string | null;
  @Column({ type: 'uuid', nullable: true })
  usuarioId!: string | null;
  @CreateDateColumn() fechaDevolucion!: Date;

  @OneToMany(() => DetalleDevolucionVenta, (detalle) => detalle.devolucion, {
    cascade: true,
  })
  detalles!: DetalleDevolucionVenta[];
}
