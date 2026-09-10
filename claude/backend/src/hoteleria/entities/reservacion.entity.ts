import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
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

  @Column({ type: 'uuid' })
  empresaId!: string;

  // Folio legible tipo RES-000123
  @Column({ type: 'varchar', length: 20, nullable: true })
  codigo!: string | null;

  @ManyToOne(() => Hotel, { nullable: false })
  @JoinColumn({ name: 'hotelid' })
  hotel!: Hotel;

  @Column({ type: 'uuid' })
  hotelId!: string;

  // Huésped = Cliente del ERP
  @Column({ type: 'uuid' })
  clienteId!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clienteNombre!: string | null; // cache para mostrar rápido

  @ManyToOne(() => TipoHabitacion, { nullable: false })
  @JoinColumn({ name: 'tipohabitacionid' })
  tipoHabitacion!: TipoHabitacion;

  @Column({ type: 'uuid' })
  tipoHabitacionId!: string;

  // Se asigna al hacer check-in
  @ManyToOne(() => Habitacion, { nullable: true })
  @JoinColumn({ name: 'habitacionid' })
  habitacion!: Habitacion | null;

  @Column({ type: 'uuid', nullable: true })
  habitacionId!: string | null;

  @Column({ type: 'date' })
  fechaEntrada!: string;

  @Column({ type: 'date' })
  fechaSalida!: string;

  @Column({ type: 'int', default: 1 })
  numHuespedes!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  tarifaNoche!: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: EstadoReservacion.CONFIRMADA,
  })
  estado!: EstadoReservacion;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCheckInReal!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCheckOutReal!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCancelacion!: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motivoCancelacion!: string | null;

  @Column({ type: 'uuid', nullable: true })
  canceladoPorId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fechaNoShow!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  marcadoNoShowPorId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  ultimoMotivoCambioHabitacion!: string | null;

  // Al cerrar, referencia a la venta generada en el ERP
  @Column({ type: 'uuid', nullable: true })
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
