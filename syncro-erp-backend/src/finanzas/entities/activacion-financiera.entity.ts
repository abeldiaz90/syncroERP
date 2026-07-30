import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EstadoActivacionFinanciera {
  NO_INICIADO = 'NO_INICIADO',
  EN_CONFIGURACION = 'EN_CONFIGURACION',
  PENDIENTE_REVISION = 'PENDIENTE_REVISION',
  LISTO_PARA_ACTIVAR = 'LISTO_PARA_ACTIVAR',
  ACTIVO = 'ACTIVO',
  REQUIERE_CORRECCION = 'REQUIERE_CORRECCION',
}

export enum ModoActivacionFinanciera {
  GUIADO = 'GUIADO',
  CONTADOR = 'CONTADOR',
}

@Entity('activaciones_financieras')
export class ActivacionFinanciera {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uniqueidentifier', unique: true })
  empresaId!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: EstadoActivacionFinanciera.NO_INICIADO,
  })
  estado!: EstadoActivacionFinanciera;

  @Column({ type: 'varchar', length: 15, nullable: true })
  modo!: ModoActivacionFinanciera | null;

  @Column({ type: 'int', default: 1 })
  pasoActual!: number;

  @Column({ type: 'date', nullable: true })
  fechaInicioContable!: Date | null;

  @Column({ type: 'bit', nullable: true })
  empresaEnOperacion!: boolean | null;

  /** Respuestas del wizard; nunca contiene secretos ni credenciales. */
  @Column({ type: 'nvarchar', length: 'MAX', default: '{}' })
  configuracionJson!: string;

  /** Último diagnóstico reproducible mostrado antes de activar. */
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  diagnosticoJson!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'uniqueidentifier', nullable: true })
  activadoPor!: string | null;

  @Column({ type: 'datetime2', nullable: true })
  fechaActivacion!: Date | null;

  @CreateDateColumn({ type: 'datetime2' })
  fechaCreacion!: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  fechaActualizacion!: Date;
}
