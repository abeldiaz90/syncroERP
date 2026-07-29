// hoteleria/entities/tarea-housekeeping.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Habitacion } from './habitacion.entity';

export enum EstadoTarea {
  PENDIENTE    = 'PENDIENTE',
  EN_PROCESO   = 'EN_PROCESO',
  TERMINADA    = 'TERMINADA',
  INSPECCIONADA = 'INSPECCIONADA', // supervisor validó
}

export enum TipoLimpieza {
  SALIDA     = 'SALIDA',      // limpieza profunda tras check-out
  ESTANCIA   = 'ESTANCIA',    // arreglo diario con huésped dentro
  MANTENIMIENTO = 'MANTENIMIENTO',
}

@Entity('tareas_housekeeping')
export class TareaHousekeeping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @ManyToOne(() => Habitacion, { nullable: false })
  @JoinColumn({ name: 'habitacionId' })
  habitacion!: Habitacion;

  @Column({ type: 'uniqueidentifier' })
  habitacionId!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  habitacionNumero!: string | null; // cache

  @Column({ type: 'varchar', length: 20, default: TipoLimpieza.SALIDA })
  tipo!: TipoLimpieza;

  @Column({ type: 'varchar', length: 20, default: EstadoTarea.PENDIENTE })
  estado!: EstadoTarea;

  // Camarista asignada = Usuario del ERP
  @Column({ type: 'uniqueidentifier', nullable: true })
  asignadoAId!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  asignadoANombre!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notas!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaInicio!: Date | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaTermino!: Date | null;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}