// hoteleria/entities/reservacion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Hotel } from './hotel.entity';
import { TipoHabitacion } from './tipo-habitacion.entity';
import { Habitacion } from './habitacion.entity';

export enum EstadoReservacion {
  CONFIRMADA = 'CONFIRMADA', // reservada, aún no llega
  CHECK_IN = 'CHECK_IN', // huésped dentro
  CHECK_OUT = 'CHECK_OUT', // ya salió, folio cerrado
  CANCELADA = 'CANCELADA',
  NO_SHOW = 'NO_SHOW', // no se presentó
}

@Entity('reservaciones')
export class Reservacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  // Folio legible tipo RES-000123
  @Column({ type: 'varchar', length: 20, nullable: true })
  codigo!: string | null;

  @ManyToOne(() => Hotel, { nullable: false })
  @JoinColumn({ name: 'hotelId' })
  hotel!: Hotel;

  @Column({ type: 'uniqueidentifier' })
  hotelId!: string;

  // Huésped = Cliente del ERP
  @Column({ type: 'uniqueidentifier' })
  clienteId!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clienteNombre!: string | null; // cache para mostrar rápido

  @ManyToOne(() => TipoHabitacion, { nullable: false })
  @JoinColumn({ name: 'tipoHabitacionId' })
  tipoHabitacion!: TipoHabitacion;

  @Column({ type: 'uniqueidentifier' })
  tipoHabitacionId!: string;

  // Se asigna al hacer check-in
  @ManyToOne(() => Habitacion, { nullable: true })
  @JoinColumn({ name: 'habitacionId' })
  habitacion!: Habitacion | null;

  @Column({ type: 'uniqueidentifier', nullable: true })
  habitacionId!: string | null;

  @Column({ type: 'date' })
  fechaEntrada!: string;

  @Column({ type: 'date' })
  fechaSalida!: string;

  @Column({ type: 'int', default: 1 })
  numHuespedes!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  tarifaNoche!: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoReservacion.CONFIRMADA,
  })
  estado!: EstadoReservacion;

  @Column({ type: 'datetime2', nullable: true })
  fechaCheckInReal!: Date | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaCheckOutReal!: Date | null;

  // Al cerrar, referencia a la venta generada en el ERP
  @Column({ type: 'uniqueidentifier', nullable: true })
  ventaId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notas!: string | null;

  // Noches de hospedaje ya cargadas al folio por la auditoría nocturna.
  // Evita postear dos veces la misma noche.
  @Column({ type: 'int', default: 0 })
  nochesPosteadas!: number;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;
}
