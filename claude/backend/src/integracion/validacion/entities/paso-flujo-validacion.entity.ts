import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PoliticaPaso, TipoPasoValidacion } from '../validacion.constants';
import { FlujoValidacion } from './flujo-validacion.entity';

/**
 * Un paso del flujo.
 *
 * `parametros` es libre a propósito: lo que necesita un proveedor de INE no se
 * parece a lo que necesita un buró, y fijar hoy un esquema para proveedores que
 * todavía no existen sería inventar requisitos.
 */
@Entity('validacion_pasos')
@Index('IX_validacion_paso_flujo', ['flujoId', 'orden'])
export class PasoFlujoValidacion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @ManyToOne(() => FlujoValidacion, (f) => f.pasos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flujoid' })
  flujo!: FlujoValidacion;

  @Column({ type: 'uuid' }) flujoId!: string;

  @Column({ type: 'int' }) orden!: number;

  @Column({ type: 'varchar', length: 40 }) tipo!: TipoPasoValidacion;

  /** Cómo lo ve el usuario en la pantalla de configuración. */
  @Column({ type: 'varchar', length: 120 }) etiqueta!: string;

  @Column({ type: 'varchar', length: 30, default: PoliticaPaso.BLOQUEANTE })
  politica!: PoliticaPaso;

  /** Cuánto suma al puntaje si sale aprobado. Puede ser negativo. */
  @Column({ type: 'int', default: 0 }) peso!: number;

  /** Umbral propio del paso, si el proveedor devuelve puntaje. */
  @Column({ type: 'int', nullable: true }) umbralMinimo!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  parametros!: Record<string, unknown>;

  @Column({ default: true }) activo!: boolean;

  @CreateDateColumn() fechaCreacion!: Date;
}
