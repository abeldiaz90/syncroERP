import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export enum TipoConvenioHotel {
  EMPRESA = 'EMPRESA',
  AGENCIA = 'AGENCIA',
}

export enum EstadoConvenioHotel {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
  SUSPENDIDO = 'SUSPENDIDO',
  VENCIDO = 'VENCIDO',
  CANCELADO = 'CANCELADO',
}

@Entity('hoteleria_convenios_credito')
@Index(
  'UX_hotel_convenio_hotel_numero',
  ['empresaId', 'hotelId', 'numeroConvenio'],
  { unique: true },
)
@Index('UX_hotel_convenio_cliente', ['empresaId', 'hotelId', 'clienteId'], {
  unique: true,
})
export class ConvenioCreditoHotel {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) hotelId!: string;
  @Column({ type: 'uuid' }) clienteId!: string;
  @Column({ type: 'varchar', length: 30 }) numeroConvenio!: string;
  @Column({ type: 'varchar', length: 20 }) tipo!: TipoConvenioHotel;
  @Column({ type: 'varchar', length: 180 }) nombreComercial!: string;
  /** Snapshot histórico de la línea maestra al solicitar/aprobar el convenio. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) limiteCredito!: number;
  @Column({ type: 'int' }) diasCredito!: number;
  @Column({ type: 'int', default: 1 }) versionCreditoCliente!: number;
  /** Campo legado conservado por compatibilidad. No amplía la línea maestra. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  tolerancia!: number;
  @Column({ default: true }) bloquearConSaldoVencido!: boolean;
  @Column({ type: 'date' }) vigenciaDesde!: string;
  @Column({ type: 'date', nullable: true }) vigenciaHasta!: string | null;
  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoConvenioHotel.PENDIENTE,
  })
  estado!: EstadoConvenioHotel;
  @Column({ type: 'uuid', nullable: true }) solicitadoPorId!:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaSolicitud!: Date | null;
  @Column({ type: 'uuid', nullable: true }) aprobadoPorId!:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaAprobacion!: Date | null;
  @Column({ type: 'uuid', nullable: true }) rechazadoPorId!:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaRechazo!: Date | null;
  @Column({ type: 'uuid', nullable: true }) suspendidoPorId!:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaSuspension!: Date | null;
  @Column({ type: 'uuid', nullable: true }) canceladoPorId!:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaCancelacion!: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  comentarioResolucion!: string | null;
  @Column({ default: true }) activo!: boolean;
  @VersionColumn({ default: 1 }) version!: number;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

export enum EstadoCuentaCityLedger {
  ABIERTA = 'ABIERTA',
  VENCIDA = 'VENCIDA',
  LIQUIDADA = 'LIQUIDADA',
  CANCELADA = 'CANCELADA',
}

@Entity('hoteleria_city_ledger_cuentas')
@Index('UX_city_ledger_folio', ['empresaId', 'folioId'], { unique: true })
@Index(['empresaId', 'convenioId', 'estado', 'fechaVencimiento'])
export class CuentaCobrarHotel {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) hotelId!: string;
  @Column({ type: 'uuid' }) convenioId!: string;
  /** Versión exacta del convenio al originar la cuenta. */
  @Column({ type: 'int', default: 1 }) convenioVersion!: number;
  @Column({ type: 'varchar', length: 30, nullable: true })
  numeroConvenioSnapshot!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true })
  tipoConvenioSnapshot!: TipoConvenioHotel | null;
  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    default: 0,
  })
  limiteCreditoAplicado!: number;
  @Column({ type: 'int', default: 0 }) diasCreditoAplicados!: number;
  @Column({ type: 'int', default: 1 }) versionCreditoClienteAplicada!: number;
  @Column({ type: 'uuid' }) clienteId!: string;
  @Column({ type: 'uuid' }) folioId!: string;
  @Column({ type: 'uuid' }) reservacionId!: string;
  @Column({ type: 'varchar', length: 30 }) folioReferencia!: string;
  @Column({ type: 'char', length: 3, default: 'MXN' }) moneda!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) subtotal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) ivaOriginal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  impuestoHospedaje!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  importeOriginal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) saldoPendiente!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  ivaReclasificado!: number;
  @Column({ type: 'date' }) fechaEmision!: string;
  @Column({ type: 'date' }) fechaVencimiento!: string;
  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoCuentaCityLedger.ABIERTA,
  })
  estado!: EstadoCuentaCityLedger;
  @VersionColumn({ default: 1 }) version!: number;
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

@Entity('hoteleria_city_ledger_cobros')
@Index(
  'UX_city_ledger_cobro_idempotencia',
  ['empresaId', 'claveIdempotencia'],
  {
    unique: true,
  },
)
@Index(['empresaId', 'cuentaCobrarId', 'fechaPago'])
export class CobroCityLedger {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) cuentaCobrarId!: string;
  @Column({ type: 'date' }) fechaPago!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) importe!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  ivaReclasificado!: number;
  @Column({ type: 'varchar', length: 30 }) metodoPago!: string;
  @Column({ type: 'uuid' }) cuentaBancariaId!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) referencia!:
    | string
    | null;
  @Column({ type: 'varchar', length: 100 }) claveIdempotencia!: string;
  @Column({ type: 'uuid', nullable: true }) movimientoTesoreriaId!:
    | string
    | null;
  @Column({ type: 'uuid', nullable: true }) asientoPendienteId!:
    | string
    | null;
  @Column({ type: 'uuid', nullable: true }) polizaId!:
    | string
    | null;
  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estadoContable!: 'PENDIENTE' | 'GENERADO' | 'FALLIDO' | 'REVERTIDO';
  @Column({ type: 'uuid', nullable: true }) registradoPorId!:
    | string
    | null;
  @CreateDateColumn() fechaCreacion!: Date;
}
