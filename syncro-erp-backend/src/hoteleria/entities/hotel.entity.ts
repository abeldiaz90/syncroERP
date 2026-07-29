// hoteleria/entities/hotel.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { Habitacion } from './habitacion.entity';
import { TipoHabitacion } from './tipo-habitacion.entity';

@Entity('hoteles')
export class Hotel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ciudad!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  // Almacén del ERP de donde salen los insumos de este hotel
  @Column({ type: 'uniqueidentifier', nullable: true })
  almacenId!: string | null;

  // Fecha operativa del hotel (el "día" contable del PMS). La auditoría
  // nocturna la avanza al día siguiente tras postear las rentas.
  @Column({ type: 'date', nullable: true })
  fechaOperativa!: string | null;

  // Última vez que corrió la auditoría nocturna (para no duplicar cargos)
  @Column({ type: 'datetime2', nullable: true })
  ultimaAuditoria!: Date | null;

  // Hora estándar de check-in / check-out (informativo)
  @Column({ type: 'varchar', length: 5, default: '15:00' })
  horaCheckIn!: string;

  @Column({ type: 'varchar', length: 5, default: '12:00' })
  horaCheckOut!: string;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @OneToMany(() => Habitacion, (h) => h.hotel)
  habitaciones!: Habitacion[];

  @OneToMany(() => TipoHabitacion, (t) => t.hotel)
  tiposHabitacion!: TipoHabitacion[];
}