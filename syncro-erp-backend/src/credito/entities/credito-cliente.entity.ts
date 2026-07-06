import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { AmortizacionCuota } from './amortizacion-cuota.entity';
import { PagoCobranza } from './pago-cobranza.entity';

export enum TipoCredito {
  CREDITO_30D = 'CREDITO_30D',
  CREDITO_60D = 'CREDITO_60D',
  CREDITO_90D = 'CREDITO_90D',
  MENSUALIDADES = 'MENSUALIDADES',
  MSI_BANCO = 'MSI_BANCO',
}

export enum EstadoCredito {
  ACTIVO = 'ACTIVO',
  LIQUIDADO = 'LIQUIDADO',
  VENCIDO = 'VENCIDO',
  CANCELADO = 'CANCELADO',
}

@Entity('creditos_clientes')
export class CreditoCliente {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @Column({ type: 'varchar', length: 30 }) folio!: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) ventaId!: string;
  @Column({ type: 'uniqueidentifier' }) clienteId!: string;

  // Montos
  @Column({ type: 'decimal', precision: 18, scale: 4 }) montoVenta!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 }) enganche!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) capitalFinanciado!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 }) totalIntereses!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) montoTotal!: number;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) saldoPendiente!: number;

  // Condiciones
  @Column({ type: 'varchar', length: 30 }) tipoCredito!: TipoCredito;
  @Column({ type: 'int', default: 1 }) numeroCuotas!: number;
  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 }) tasaInteresMensual!: number;
  @Column({ default: false }) sinInteres!: boolean;
  @Column({ type: 'varchar', length: 10, default: 'MXN' }) moneda!: string;

  // Fechas
  @Column({ type: 'date' }) fechaInicio!: Date;
  @Column({ type: 'date' }) fechaVencimiento!: Date;

  // Enganche
  @Column({ type: 'varchar', length: 30, nullable: true }) metodoPagoEnganche!: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) cuentaBancariaEngancheId!: string;

  // Estado
  @Column({ type: 'varchar', length: 20, default: EstadoCredito.ACTIVO }) estado!: EstadoCredito;
  @Column({ type: 'varchar', length: 500, nullable: true }) notas!: string;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;

  @OneToMany(() => AmortizacionCuota, (c) => c.credito, { cascade: true }) cuotas!: AmortizacionCuota[];
  @OneToMany(() => PagoCobranza, (p) => p.credito) pagos!: PagoCobranza[];
}