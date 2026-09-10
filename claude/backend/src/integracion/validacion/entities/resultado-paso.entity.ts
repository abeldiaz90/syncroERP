import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ResultadoPaso, TipoPasoValidacion } from '../validacion.constants';

/** Lo que contestó cada paso en una corrida. */
@Entity('validacion_resultados_paso')
@Index('IX_validacion_resultado_ejecucion', ['ejecucionId', 'orden'])
export class ResultadoPasoValidacion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) ejecucionId!: string;
  @Column({ type: 'uuid', nullable: true }) pasoId!: string | null;

  @Column({ type: 'int' }) orden!: number;
  @Column({ type: 'varchar', length: 40 }) tipo!: TipoPasoValidacion;
  @Column({ type: 'varchar', length: 120 }) etiqueta!: string;

  @Column({ type: 'varchar', length: 20 }) resultado!: ResultadoPaso;

  @Column({ type: 'int', nullable: true }) puntaje!: number | null;
  @Column({ type: 'int', default: 0 }) puntosAportados!: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  proveedor!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  detalle!: string | null;

  /** Respuesta cruda del proveedor, para poder auditar la decisión. */
  @Column({ type: 'jsonb', nullable: true })
  evidencia!: Record<string, unknown> | null;

  @CreateDateColumn() fechaCreacion!: Date;
}
