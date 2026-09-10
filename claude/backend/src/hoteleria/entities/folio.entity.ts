import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  VersionColumn,
} from 'typeorm';
import { Reservacion } from './reservacion.entity';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';

export enum EstadoFolio {
  ABIERTO = 'ABIERTO',
  PENDIENTE_PAGO = 'PENDIENTE_PAGO',
  CERRADO = 'CERRADO',
  CANCELADO = 'CANCELADO',
}

export enum EstadoContableFolio {
  NO_GENERADO = 'NO_GENERADO',
  PENDIENTE = 'PENDIENTE',
  GENERADO = 'GENERADO',
  FALLIDO = 'FALLIDO',
  REVERTIDO = 'REVERTIDO',
}

@Entity('folios')
@Index('UX_folios_empresa_reservacion', ['empresaId', 'reservacionId'], {
  unique: true,
})
@Index(['empresaId', 'estado', 'estadoContable'])
export class Folio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => Reservacion, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'reservacionid' })
  reservacion!: Reservacion;

  @Column({ type: 'uuid' })
  reservacionId!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoFolio.ABIERTO })
  estado!: EstadoFolio;

  /** Fecha del PMS a la que pertenece el folio, no la zona horaria del servidor. */
  @Column({ type: 'date', nullable: true })
  fechaOperativa!: string | null;

  @Column({ type: 'char', length: 3, default: 'MXN' })
  moneda!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  impuestoHospedaje!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  total!: number;

  /** Incluye aplicaciones de crédito. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalAplicado!: number;

  /** Dinero efectivamente cobrado; excluye crédito a empresa/agencia. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalCobrado!: number;

  /** Importe transferido a una cuenta por cobrar del City Ledger. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  totalCredito!: number;

  @Column({ type: 'uuid', nullable: true })
  cuentaCobrarHotelId!: string | null;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  saldoPendiente!: number;

  @Column({
    type: 'varchar',
    length: 24,
    default: EstadoContableFolio.NO_GENERADO,
  })
  estadoContable!: EstadoContableFolio;

  @Column({ type: 'uuid', nullable: true })
  polizaId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  asientoPendienteId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  claveIdempotenciaCierre!: string | null;

  @Column({ type: 'uuid', nullable: true })
  cerradoPorId!: string | null;

  @CreateDateColumn()
  fechaApertura!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @VersionColumn({ default: 1 })
  version!: number;

  @OneToMany(() => CargoFolio, (c) => c.folio)
  cargos!: CargoFolio[];

  @OneToMany(() => PagoFolioHotel, (p) => p.folio)
  pagos!: PagoFolioHotel[];
}

export enum TipoCargo {
  HOSPEDAJE = 'HOSPEDAJE',
  CONSUMO = 'CONSUMO',
  SERVICIO = 'SERVICIO',
  PENALIZACION = 'PENALIZACION',
  DESCUENTO = 'DESCUENTO',
  OTRO = 'OTRO',
}

@Entity('cargos_folio')
@Index(
  'UX_cargos_folio_empresa_idempotencia',
  ['empresaId', 'claveIdempotencia'],
  {
    unique: true,
    where: 'claveIdempotencia IS NOT NULL',
  },
)
export class CargoFolio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => Folio, (f) => f.cargos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'folioid' })
  folio!: Folio;

  @Column({ type: 'uuid' })
  folioId!: string;

  @Column({ type: 'varchar', length: 20, default: TipoCargo.OTRO })
  tipo!: TipoCargo;

  @Column({ type: 'varchar', length: 200 })
  concepto!: string;

  @Column({ type: 'uuid', nullable: true })
  productoId!: string | null;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 4, default: 1 })
  cantidad!: number;

  /** Precio base o total según la configuración del hotel en el momento del cargo. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 9, scale: 4, default: 0 })
  tasaIva!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 9, scale: 4, default: 0 })
  tasaImpuestoHospedaje!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  impuestoHospedaje!: number;

  /** Importe total de la línea, incluidos los impuestos configurados. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  importe!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  centroIngreso!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  claveIdempotencia!: string | null;

  @Column({ type: 'uuid', nullable: true })
  registradoPorId!: string | null;

  @CreateDateColumn()
  fecha!: Date;
}

export enum MetodoPagoHotel {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
  CREDITO_EMPRESA = 'CREDITO_EMPRESA',
  CREDITO_AGENCIA = 'CREDITO_AGENCIA',
  OTRO = 'OTRO',
}

export enum EstadoPagoHotel {
  APLICADO = 'APLICADO',
  REVERSADO = 'REVERSADO',
}

@Entity('pagos_folio_hotel')
@Index(
  'UX_pagos_folio_empresa_idempotencia',
  ['empresaId', 'claveIdempotencia'],
  {
    unique: true,
  },
)
@Index(['empresaId', 'folioId', 'estado'])
export class PagoFolioHotel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => Folio, (f) => f.pagos, {
    nullable: false,
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'folioid' })
  folio!: Folio;

  @Column({ type: 'uuid' })
  folioId!: string;

  @Column({ type: 'varchar', length: 30 })
  metodoPago!: MetodoPagoHotel;

  @ManyToOne(() => CuentaBancaria, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cuentabancariaid' })
  cuentaBancaria!: CuentaBancaria | null;

  @Column({ type: 'uuid', nullable: true })
  cuentaBancariaId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  convenioId!: string | null;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  importe!: number;

  @Column({ type: 'char', length: 3, default: 'MXN' })
  moneda!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 6, default: 1 })
  tipoCambio!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referencia!: string | null;

  @Column({ type: 'varchar', length: 100 })
  claveIdempotencia!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoPagoHotel.APLICADO })
  estado!: EstadoPagoHotel;

  @Column({ type: 'uuid', nullable: true })
  movimientoTesoreriaId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  registradoPorId!: string | null;

  @CreateDateColumn()
  fecha!: Date;
}
