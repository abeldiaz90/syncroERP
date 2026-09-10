import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PropositoFlujo } from '../validacion.constants';
import { PasoFlujoValidacion } from './paso-flujo-validacion.entity';

/**
 * El flujo que diseñó el administrador de una empresa.
 *
 * Se versiona y no se reescribe: una ejecución guarda la versión con la que
 * corrió. Si mañana alguien endurece la política, las decisiones de ayer
 * siguen siendo explicables con la política de ayer, que es lo que pide
 * cualquier auditoría de crédito.
 */
@Entity('validacion_flujos')
@Index('IX_validacion_flujo_empresa', ['empresaId', 'proposito', 'activo'])
export class FlujoValidacion {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid' }) empresaId!: string;

  @Column({ type: 'varchar', length: 120 }) nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: PropositoFlujo.ORIGINACION_CREDITO,
  })
  proposito!: PropositoFlujo;

  /** Sólo un flujo activo por empresa y propósito. */
  @Column({ default: false }) activo!: boolean;

  @Column({ type: 'int', default: 1 }) version!: number;

  /**
   * Techo que este flujo puede autorizar sin comité. Cero significa que todo
   * pasa por autorización humana, que es el valor seguro por omisión.
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  topeAutomatico!: string;

  /** Puntaje mínimo para aprobar. Por debajo, revisión o rechazo. */
  @Column({ type: 'int', default: 60 }) puntajeMinimo!: number;

  @Column({ type: 'uuid', nullable: true }) creadoPorId!: string | null;

  @CreateDateColumn() fechaCreacion!: Date;
  @UpdateDateColumn() fechaActualizacion!: Date;

  @OneToMany(() => PasoFlujoValidacion, (p) => p.flujo, { cascade: true })
  pasos!: PasoFlujoValidacion[];
}
