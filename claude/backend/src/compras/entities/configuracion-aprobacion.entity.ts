import { decimalNumberTransformer } from '../../common/database/decimal-number.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Departamento } from '../../departamentos/entities/departamento.entity';
import { Usuario } from '../../iam/entities/usuario.entity';

@Entity('configuraciones_aprobacion')
export class ConfiguracionAprobacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  empresaId: string;

  @Column({ type: 'varchar', length: 40, default: 'REQUISICION' })
  proceso: string;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: 'departamentoid' })
  departamento: Departamento;

  @Column({ type: 'uuid', nullable: true })
  departamentoId?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuarioid' })
  usuario: Usuario;

  @Column({ type: 'uuid', nullable: true })
  usuarioId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rolAprobador?: string;

  @Column({ type: 'int' })
  orden: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, nullable: true })
  montoDesde?: number;

  @Column({ type: 'decimal', transformer: decimalNumberTransformer, precision: 18, scale: 2, nullable: true })
  montoHasta?: number;

  @Column({ type: 'int', default: 24 })
  tiempoLimiteHoras: number;

  @Column({ type: 'boolean', default: true })
  obligatorio: boolean;

  @Column({ type: 'boolean', default: false })
  permiteAutoaprobacion: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
