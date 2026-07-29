/**
 * ============================================================================
 * SyncroERP · Tesorería — entidades
 * ----------------------------------------------------------------------------
 * Módulo nuevo. El ERP tenía `cuentas_bancarias` (el catálogo) pero nada que
 * registrara el dinero moviéndose por ellas. En la práctica eso significa que
 * el saldo del banco vivía sólo en la contabilidad, y nadie podía responder
 * "¿cuánto tengo hoy en la cuenta?" sin abrir la banca en línea.
 *
 * Modelo: MovimientoTesoreria es el movimiento según nosotros; LineaEstadoCuenta
 * es el movimiento según el banco. La conciliación los empareja. Mantenerlos
 * separados es lo que permite detectar cheques en tránsito, cargos no
 * registrados y depósitos que el banco aún no aplica.
 * ============================================================================
 */

import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { CuentaBancaria } from '../../credito/entities/cuenta-bancaria.entity';

export enum TipoMovimiento {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
  TRASPASO_ENTRADA = 'TRASPASO_ENTRADA',
  TRASPASO_SALIDA = 'TRASPASO_SALIDA',
}

export enum OrigenMovimiento {
  MANUAL = 'MANUAL',
  VENTA = 'VENTA',
  COBRANZA = 'COBRANZA',
  PAGO_PROVEEDOR = 'PAGO_PROVEEDOR',
  NOMINA = 'NOMINA',
  TRASPASO = 'TRASPASO',
  COMISION_BANCARIA = 'COMISION_BANCARIA',
  IMPUESTO = 'IMPUESTO',
}

export enum EstadoConciliacion {
  PENDIENTE = 'PENDIENTE',
  CONCILIADO = 'CONCILIADO',
  /** Registrado por nosotros, el banco aún no lo aplica. */
  EN_TRANSITO = 'EN_TRANSITO',
}

export enum EstadoCierre {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
}

/* ── Movimiento propio ────────────────────────────────────────────────────── */

@Entity('tesoreria_movimientos')
@Index(['empresaId', 'fecha'])
@Index(['cuentaBancariaId', 'estadoConciliacion'])
export class MovimientoTesoreria {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;

  @Column({ type: 'varchar', length: 30 }) folio!: string;

  @ManyToOne(() => CuentaBancaria, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cuentaBancariaId' })
  cuentaBancaria!: CuentaBancaria;
  @Column({ type: 'uniqueidentifier' }) cuentaBancariaId!: string;

  @Column({ type: 'date' }) fecha!: Date;
  @Column({ type: 'varchar', length: 30 }) tipo!: TipoMovimiento;
  @Column({ type: 'varchar', length: 30, default: OrigenMovimiento.MANUAL })
  origen!: OrigenMovimiento;

  @Column({ type: 'decimal', precision: 18, scale: 2 }) importe!: number;

  /**
   * Saldo de la cuenta después de este movimiento.
   * Se almacena para que el estado de cuenta no tenga que recalcular la suma
   * completa en cada consulta: con miles de movimientos eso es inviable.
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) saldoPosterior!: number;

  @Column({ type: 'varchar', length: 250 }) concepto!: string;
  @Column({ type: 'varchar', length: 60, nullable: true }) referencia?: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) numeroCheque?: string;

  /** Documento que originó el movimiento (venta, orden de compra, recibo). */
  @Column({ type: 'uniqueidentifier', nullable: true }) documentoId?: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) tipoDocumento?: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) terceroId?: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) nombreTercero?: string;

  @Column({ type: 'varchar', length: 20, default: EstadoConciliacion.PENDIENTE })
  estadoConciliacion!: EstadoConciliacion;
  @Column({ type: 'date', nullable: true }) fechaConciliacion?: Date;
  @Column({ type: 'uniqueidentifier', nullable: true }) lineaEstadoCuentaId?: string;

  @Column({ type: 'uniqueidentifier', nullable: true }) polizaId?: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) registradoPorId?: string;

  @Column({ default: false }) cancelado!: boolean;
  @Column({ type: 'varchar', length: 250, nullable: true }) motivoCancelacion?: string;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;
}

/* ── Estado de cuenta del banco ───────────────────────────────────────────── */

@Entity('tesoreria_estados_cuenta')
@Index(['empresaId', 'cuentaBancariaId', 'ejercicio', 'mes'], { unique: true })
export class EstadoCuentaBancario {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @Column({ type: 'uniqueidentifier' }) cuentaBancariaId!: string;

  @Column({ type: 'int' }) ejercicio!: number;
  @Column({ type: 'int' }) mes!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 }) saldoInicialBanco!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2 }) saldoFinalBanco!: number;

  @Column({ type: 'varchar', length: 20, default: EstadoCierre.ABIERTA })
  estado!: EstadoCierre;

  @Column({ type: 'varchar', length: 200, nullable: true }) archivoOrigen?: string;
  @Column({ type: 'uniqueidentifier', nullable: true }) conciliadoPorId?: string;
  @Column({ type: 'datetime2', nullable: true }) fechaCierre?: Date;

  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Línea del estado de cuenta ───────────────────────────────────────────── */

@Entity('tesoreria_lineas_estado_cuenta')
@Index(['estadoCuentaId', 'fecha'])
export class LineaEstadoCuenta {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uniqueidentifier' }) empresaId!: string;
  @Column({ type: 'uniqueidentifier' }) estadoCuentaId!: string;

  @Column({ type: 'date' }) fecha!: Date;
  @Column({ type: 'varchar', length: 250 }) descripcion!: string;
  @Column({ type: 'varchar', length: 60, nullable: true }) referencia?: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) cargo!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 }) abono!: number;

  @Column({ default: false }) conciliada!: boolean;
  @Column({ type: 'uniqueidentifier', nullable: true }) movimientoId?: string;

  @CreateDateColumn() fechaCreacion!: Date;
}
