import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
// hoteleria/entities/tipo-habitacion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Hotel } from './hotel.entity';
import { DotacionTipoHabitacion } from './dotacion-tipo-habitacion.entity';

@Entity('tipos_habitacion')
export class TipoHabitacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @ManyToOne(() => Hotel, (h) => h.tiposHabitacion, { nullable: false })
  @JoinColumn({ name: 'hotelid' })
  hotel!: Hotel;

  @Column({ type: 'uuid' })
  hotelId!: string;

  @Column({ type: 'varchar', length: 80 })
  nombre!: string; // Sencilla, Doble, Suite, Junior Suite…

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion!: string | null;

  // Capacidad de personas
  @Column({ type: 'int', default: 2 })
  capacidad!: number;

  // Tarifa base por noche
  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, default: 0 })
  tarifaBase!: number;

  @Column({ default: true })
  activo!: boolean;

  @CreateDateColumn()
  fechaCreacion!: Date;

  @UpdateDateColumn()
  fechaActualizacion!: Date;

  @OneToMany(() => DotacionTipoHabitacion, (d) => d.tipoHabitacion)
  dotaciones!: DotacionTipoHabitacion[];
}
