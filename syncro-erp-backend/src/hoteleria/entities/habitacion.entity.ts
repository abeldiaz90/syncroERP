// hoteleria/entities/habitacion.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Hotel } from './hotel.entity';
import { TipoHabitacion } from './tipo-habitacion.entity';

// Estados operativos de una habitación
export enum EstadoHabitacion {
  DISPONIBLE   = 'DISPONIBLE',    // limpia y lista para vender
  OCUPADA      = 'OCUPADA',       // huésped dentro
  LIMPIEZA     = 'LIMPIEZA',      // salió huésped, pendiente de limpiar
  MANTENIMIENTO = 'MANTENIMIENTO',// fuera de servicio por reparación
  BLOQUEADA    = 'BLOQUEADA',     // no vendible (uso interno, etc.)
}

@Entity('habitaciones')
@Unique(['hotelId', 'numero'])
export class Habitacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @ManyToOne(() => Hotel, (h) => h.habitaciones, { nullable: false })
  @JoinColumn({ name: 'hotelId' })
  hotel!: Hotel;

  @Column({ type: 'uniqueidentifier' })
  hotelId!: string;

  @ManyToOne(() => TipoHabitacion, { nullable: false })
  @JoinColumn({ name: 'tipoHabitacionId' })
  tipoHabitacion!: TipoHabitacion;

  @Column({ type: 'uniqueidentifier' })
  tipoHabitacionId!: string;

  @Column({ type: 'varchar', length: 20 })
  numero!: string; // "101", "202-A"

  @Column({ type: 'int', nullable: true })
  piso!: number | null;

@Column({
    type: 'varchar',
    length: 20,
    default: EstadoHabitacion.DISPONIBLE,
  })
  estado!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notas!: string | null;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}