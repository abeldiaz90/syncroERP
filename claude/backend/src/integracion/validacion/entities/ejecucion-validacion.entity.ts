import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoEjecucion } from '../validacion.constants';
import { decimalNumberTransformer } from '../../../common/database/decimal-number.transformer';

/**
 * Una corrida del flujo sobre un cliente concreto.
 *
 * Es el expediente: qué política se aplicó, qué contestó cada proveedor y con
 * qué se decidió. Sin esto, "por qué le negamos el crédito a este señor" no
 * tiene respuesta a los seis meses.
 */
@Entity('validacion_ejecuciones')
@Index('IX_validacion_ejecucion_cliente', ['empresaId', 'clienteId', 'fechaCreacion'])
export class EjecucionValidacion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;
  @Column({ type: 'uuid' }) clienteId!: string;

  @Column({ type: 'uuid' }) flujoId!: string;
  /** Versión del flujo con la que corrió. No se recalcula nunca. */
  @Column({ type: 'int' }) flujoVersion!: number;
  @Column({ type: 'varchar', length: 120 }) flujoNombre!: string;

  /*
   * Decimal con transformador: sin él, PostgreSQL entrega la columna como
   * CADENA y una suma se convierte en una concatenación silenciosa. Es la
   * regla que vigila `coherencia.spec.ts`, y estas tres entidades eran las
   * únicas que se habían quedado fuera.
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 , transformer: decimalNumberTransformer })
  limiteSolicitado!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 , transformer: decimalNumberTransformer })
  limiteSugerido!: number;

  @Column({ type: 'int', default: 0 }) puntaje!: number;

  @Column({ type: 'varchar', length: 30, default: EstadoEjecucion.EN_PROCESO })
  estado!: EstadoEjecucion;

  /** Por qué salió así, en palabras. Es lo que se le enseña a un auditor. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  motivos!: string[];

  /** Verdadero cuando fue una simulación: no otorga nada ni deja rastro operativo. */
  @Column({ default: false }) simulacion!: boolean;

  @Column({ type: 'uuid', nullable: true }) usuarioId!: string | null;

  @Column({ type: 'timestamptz', nullable: true }) fechaFin!: Date | null;

  @CreateDateColumn() fechaCreacion!: Date;
}
