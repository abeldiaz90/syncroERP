import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Habitacion } from './habitacion.entity';
import { TipoHabitacion } from './tipo-habitacion.entity';

@Entity('hoteles')
@Index('UX_hoteles_empresa_nombre', ['empresaId', 'nombre'], { unique: true })
export class Hotel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ciudad!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  estadoRepublica!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  municipio!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  codigoPostal!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  registroNacionalTurismo!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  @Column({ type: 'uuid', nullable: true })
  almacenId!: string | null;

  @Column({ type: 'date', nullable: true })
  fechaOperativa!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ultimaAuditoria!: Date | null;

  @Column({ type: 'varchar', length: 5, default: '15:00' })
  horaCheckIn!: string;

  @Column({ type: 'varchar', length: 5, default: '12:00' })
  horaCheckOut!: string;

  @Column({ type: 'varchar', length: 60, default: 'America/Mexico_City' })
  zonaHoraria!: string;

  @Column({ type: 'char', length: 3, default: 'MXN' })
  moneda!: string;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 9, scale: 4, default: 16 })
  tasaIva!: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 9, scale: 4, default: 0 })
  tasaImpuestoHospedaje!: number;

  @Column({ type: 'varchar', length: 100, default: 'Impuesto sobre hospedaje' })
  nombreImpuestoHospedaje!: string;

  @Column({ default: true })
  preciosIncluyenImpuestos!: boolean;

  @Column({ default: true })
  exigirInventarioDotacion!: boolean;

  @Column({ default: false })
  permitirSobreventa!: boolean;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  politicaCancelacion!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  avisoPrivacidad!: string | null;

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
