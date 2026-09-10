import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
/**
 * ============================================================================
 * SyncroERP · Activos fijos — entidades
 * ----------------------------------------------------------------------------
 * Módulo nuevo. El ERP llevaba contabilidad completa pero no tenía dónde
 * registrar la maquinaria, el equipo de cómputo ni el transporte, así que la
 * depreciación mensual se capturaba a mano en pólizas o simplemente no se
 * registraba: el balance quedaba inflado y la declaración anual mal.
 *
 * Cubre los métodos que reconoce la LISR mexicana (línea recta con porcentajes
 * máximos por tipo de bien) y el de saldos decrecientes para uso financiero.
 * ============================================================================
 */

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
} from 'typeorm';
import { CuentaContable } from '../../finanzas/entities/cuenta-contable.entity';

export enum MetodoDepreciacion {
  LINEA_RECTA = 'LINEA_RECTA',
  SALDOS_DECRECIENTES = 'SALDOS_DECRECIENTES',
  /** Sin depreciación: terrenos y obras de arte. */
  NO_DEPRECIABLE = 'NO_DEPRECIABLE',
}

export enum EstadoActivo {
  ACTIVO = 'ACTIVO',
  EN_MANTENIMIENTO = 'EN_MANTENIMIENTO',
  TOTALMENTE_DEPRECIADO = 'TOTALMENTE_DEPRECIADO',
  BAJA = 'BAJA',
  VENDIDO = 'VENDIDO',
}

export enum MotivoBaja {
  VENTA = 'VENTA',
  OBSOLESCENCIA = 'OBSOLESCENCIA',
  SINIESTRO = 'SINIESTRO',
  DONACION = 'DONACION',
  ROBO = 'ROBO',
}

/* ── Categoría ────────────────────────────────────────────────────────────── */

@Entity('activos_categorias')
@Index(['empresaId', 'clave'], { unique: true })
export class CategoriaActivo {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 20 }) clave!: string;
  @Column({ type: 'varchar', length: 100 }) nombre!: string;

  /** Tasa anual sugerida. LISR: cómputo 30 %, transporte 25 %, mobiliario 10 %. */
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2, default: 10 })
  tasaAnual!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: MetodoDepreciacion.LINEA_RECTA,
  })
  metodo!: MetodoDepreciacion;

  /* Cuentas contables para que la póliza se genere sola */
  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentaactivoid' })
  cuentaActivo?: CuentaContable;
  @Column({ type: 'uuid', nullable: true }) cuentaActivoId?: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentadepreciacionacumuladaid' })
  cuentaDepreciacionAcumulada?: CuentaContable;
  @Column({ type: 'uuid', nullable: true })
  cuentaDepreciacionAcumuladaId?: string;

  @ManyToOne(() => CuentaContable, { nullable: true })
  @JoinColumn({ name: 'cuentagastodepreciacionid' })
  cuentaGastoDepreciacion?: CuentaContable;
  @Column({ type: 'uuid', nullable: true })
  cuentaGastoDepreciacionId?: string;

  @Column({ default: true }) activo!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}

/* ── Activo ───────────────────────────────────────────────────────────────── */

@Entity('activos_fijos')
@Index(['empresaId', 'codigo'], { unique: true })
@Index(['empresaId', 'estado'])
export class ActivoFijo {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  /** Consecutivo legible: AF-000123. Es lo que se pega en la etiqueta física. */
  @Column({ type: 'varchar', length: 30 }) codigo!: string;

  @Column({ type: 'varchar', length: 160 }) nombre!: string;
  @Column({ type: 'varchar', length: 400, nullable: true })
  descripcion?: string;

  @ManyToOne(() => CategoriaActivo, { nullable: false, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'categoriaid' })
  categoria!: CategoriaActivo;
  @Column({ type: 'uuid' }) categoriaId!: string;

  /* Identificación física */
  @Column({ type: 'varchar', length: 80, nullable: true }) numeroSerie?: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) marca?: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) modelo?: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) ubicacion?: string;
  @Column({ type: 'uuid', nullable: true }) responsableId?: string;
  @Column({ type: 'uuid', nullable: true }) departamentoId?: string;

  /* Adquisición */
  @Column({ type: 'date' }) fechaAdquisicion!: Date;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  costoAdquisicion!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  valorResidual!: number;
  @Column({ type: 'uuid', nullable: true }) proveedorId?: string;
  @Column({ type: 'varchar', length: 40, nullable: true })
  facturaCompra?: string;

  /* Depreciación */
  @Column({ type: 'varchar', length: 30 }) metodo!: MetodoDepreciacion;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 5, scale: 2 }) tasaAnual!: number;
  @Column({ type: 'int' }) vidaUtilMeses!: number;

  /** Fecha desde la que se deprecia; suele ser el mes siguiente al alta. */
  @Column({ type: 'date' }) inicioDepreciacion!: Date;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  depreciacionAcumulada!: number;

  @Column({ type: 'int', default: 0 }) mesesDepreciados!: number;

  /* Estado */
  @Column({ type: 'varchar', length: 30, default: EstadoActivo.ACTIVO })
  estado!: EstadoActivo;

  @Column({ type: 'date', nullable: true }) fechaBaja?: Date;
  @Column({ type: 'varchar', length: 30, nullable: true })
  motivoBaja?: MotivoBaja;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, nullable: true })
  valorVenta?: number;
  @Column({ type: 'varchar', length: 400, nullable: true }) notasBaja?: string;

  @OneToMany(() => DepreciacionMensual, (d) => d.activo)
  depreciaciones!: DepreciacionMensual[];

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;

  /** Valor en libros. Calculado, nunca almacenado: no puede desincronizarse. */
  get valorEnLibros(): number {
    return Number(this.costoAdquisicion) - Number(this.depreciacionAcumulada);
  }
}

/* ── Depreciación mensual ─────────────────────────────────────────────────── */

@Entity('activos_depreciaciones')
@Index(['empresaId', 'ejercicio', 'mes'])
@Index(['activoId', 'ejercicio', 'mes'], { unique: true })
export class DepreciacionMensual {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) empresaId!: string;

  @ManyToOne(() => ActivoFijo, (a) => a.depreciaciones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activoid' })
  activo!: ActivoFijo;
  @Column({ type: 'uuid' }) activoId!: string;

  @Column({ type: 'int' }) ejercicio!: number;
  @Column({ type: 'int' }) mes!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) importe!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 })
  acumuladaAlCierre!: number;
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2 }) valorEnLibros!: number;

  /** Póliza contable generada por la corrida, si la hubo. */
  @Column({ type: 'uuid', nullable: true }) polizaId?: string;

  @Column({ default: false }) cancelada!: boolean;
  @CreateDateColumn() fechaCreacion!: Date;
}
