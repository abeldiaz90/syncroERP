import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MovimientoCaja } from './movimiento-caja.entity';

export enum EstadoTurnoCaja {
  ABIERTO = 'ABIERTO',
  CERRADO = 'CERRADO',
}

@Entity('caja_turnos')
@Index('IX_caja_turnos_empresa_estado', ['empresaId', 'estado', 'fechaApertura'])
@Index('UX_caja_turnos_cuenta_abierta', ['empresaId', 'cuentaCajaId'], {
  unique: true,
  where: "estado = 'ABIERTO'",
})
export class TurnoCaja {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  empresaId!: string;

  @Column({ type: 'uuid' })
  cuentaCajaId!: string;

  @Column({ type: 'uuid' })
  usuarioAperturaId!: string;

  @Column({ type: 'uuid', nullable: true })
  usuarioCierreId!: string | null;

  @Column({ type: 'varchar', length: 20, default: EstadoTurnoCaja.ABIERTO })
  estado!: EstadoTurnoCaja;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    default: 0,
  })
  fondoInicial!: number;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalEntradas!: number;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalSalidas!: number;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    default: 0,
  })
  efectivoEsperado!: number;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    nullable: true,
  })
  efectivoContado!: number | null;

  @Column({
    type: 'decimal',
    transformer: decimalNumberTransformer,
    precision: 18,
    scale: 2,
    nullable: true,
  })
  diferencia!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacionesApertura!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacionesCierre!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaApertura!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @OneToMany(() => MovimientoCaja, (movimiento) => movimiento.turno)
  movimientos!: MovimientoCaja[];
}
