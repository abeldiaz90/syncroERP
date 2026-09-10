import { decimalNumberTransformer } from '../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Cliente } from './../clientes/entities/cliente.entity';
import { PartidaFactura } from './partida-factura.entity';
import { Venta } from '../ventas/entities/venta.entity';

export enum EstadoFactura {
  BORRADOR = 'BORRADOR',
  PENDIENTE_TIMBRADO = 'PENDIENTE_TIMBRADO',
  TIMBRADA = 'TIMBRADA',
  ERROR_TIMBRADO = 'ERROR_TIMBRADO',
  CANCELACION_PENDIENTE = 'CANCELACION_PENDIENTE',
  ERROR_CANCELACION = 'ERROR_CANCELACION',
  CANCELADA = 'CANCELADA',
}

export enum MetodoPago {
  PUE = 'PUE',
  PPD = 'PPD',
}

export enum FormaPago {
  EFECTIVO = '01',
  CHEQUE = '02',
  TRANSFERENCIA = '03',
  TARJETA_CREDITO = '04',
  TARJETA_DEBITO = '28',
  POR_DEFINIR = '99',
}

@Entity('facturas')
@Index('UX_facturas_empresa_serie_folio', ['empresaId', 'serie', 'folio'], { unique: true })
@Index('UX_facturas_empresa_uuid', ['empresaId', 'uuid'], { unique: true, where: 'uuid IS NOT NULL' })
@Index('UX_facturas_empresa_idempotencia', ['empresaId', 'claveIdempotencia'], { unique: true, where: 'claveIdempotencia IS NOT NULL' })
@Index(['empresaId', 'estado', 'fechaCreacion'])
export class Factura {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @ManyToOne(() => Venta, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'ventaid' }) venta!: Venta | null;
  @Column({ type: 'uuid', nullable: true }) ventaId!: string | null;

  /** I=Ingreso, E=Egreso, P=Pago, según catálogo SAT. */
  @Column({ type: 'char', length: 1, default: 'I' })
  tipoComprobante!: 'I' | 'E' | 'P';

  @ManyToOne(() => Factura, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cfdirelacionadoid' })
  cfdiRelacionado!: Factura | null;
  @Column({ type: 'uuid', nullable: true })
  cfdiRelacionadoId!: string | null;
  @Column({ type: 'varchar', length: 2, nullable: true })
  tipoRelacion!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'A' }) serie!: string;
  @Column({ type: 'int' }) folio!: number;
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) fecha!: Date;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'clienteid' }) cliente!: Cliente | null;
  @Column({ type: 'uuid', nullable: true }) clienteId!: string | null;
  @Column({ type: 'varchar', length: 13 }) rfcReceptor!: string;
  @Column({ type: 'varchar', length: 300 }) nombreReceptor!: string;
  @Column({ type: 'varchar', length: 10 }) regimenFiscalReceptor!: string;
  @Column({ type: 'varchar', length: 10 }) codigoPostalReceptor!: string;
  @Column({ type: 'varchar', length: 10, default: 'G03' }) usoCFDI!: string;

  @Column({ type: 'varchar', length: 3, default: FormaPago.TRANSFERENCIA }) formaPago!: string;
  @Column({ type: 'varchar', length: 3, default: MetodoPago.PUE }) metodoPago!: string;
  @Column({ type: 'varchar', length: 3, default: 'MXN' }) moneda!: string;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 10, scale: 4, default: 1 }) tipoCambio!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) subtotal!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) totalImpuestosTrasladados!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 4, default: 0 }) total!: number;

  @Column({ type: 'varchar', length: 30, default: EstadoFactura.BORRADOR })
  estado!: EstadoFactura;
  @Column({ type: 'varchar', length: 100, nullable: true }) claveIdempotencia!: string | null;
  @Column({ type: 'int', default: 0 }) intentosTimbrado!: number;
  @Column({ type: 'varchar', length: 2000, nullable: true }) ultimoError!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaUltimoIntento!: Date | null;
  @Column({ type: 'text', nullable: true }) payloadPac!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true }) uuid!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) facturamaId!: string | null;
  @Column({ type: 'text', nullable: true }) xmlTimbrado!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) fechaTimbrado!: Date | null;

  @Column({ type: 'timestamptz', nullable: true }) fechaCancelacion!: Date | null;
  @Column({ type: 'varchar', length: 10, nullable: true }) motivoCancelacion!: string | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) uuidSustitucion!: string | null;
  @Column({ type: 'text', nullable: true }) acuseCancelacion!: string | null;

  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @OneToMany(() => PartidaFactura, (p) => p.factura, { cascade: true }) partidas!: PartidaFactura[];
  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
  @VersionColumn({ default: 1 }) version!: number;
}
